"""
提取任务路由
POST /api/v1/extract/start  - 发起提取
GET  /api/v1/extract/results/{file_id}  - 查询提取结果
"""
import asyncio
import json
import logging
from collections import Counter
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.supabase_client import get_supabase, get_signed_url
from app.services.llm_service import extract_grouped_fields
from app.services.file_service import download_file_bytes, extract_text_from_file
from app.services.ocr_service import run_ocr, find_block_for_source, find_text_bbox_in_pdf_simple
from app.services.text_processor import get_text_splitter

logger = logging.getLogger(__name__)
router = APIRouter()

# 系统级并发：同时最多处理 3 个文件（Ollama 串行推理由 _OLLAMA_SEMAPHORE 保证）
_system_semaphore = asyncio.Semaphore(3)

# 已终止任务集 (task_id -> bool)
_terminated_tasks: set[str] = set()


# ---------- Schema ----------

class ExtractRequest(BaseModel):
    task_id: str
    file_ids: List[str]          # 要提取的文件 ID 列表（空列表 = 提取全部）
    prompt_set_id: str           # 提示词组 ID
    user_id: str                 # 发起者 user_id（用于鉴权校验）


class ExtractResponse(BaseModel):
    task_id: str
    queued_file_count: int
    message: str


class TestConnectionRequest(BaseModel):
    url: str
    api_key: str
    model_name: str
    provider: str = "openai"
    temperature: float = 0.2
    top_p: float = 0.8


class TerminateRequest(BaseModel):
    user_id: str


# ---------- 后台任务：提取单个文件 ----------

async def _extract_single_file(
    task_id: str,
    file_id: str,
    file_path: str,
    file_name: str,
    mime_type: Optional[str],
    fields: list,
    prompt_set: dict,
    model_config: dict,
    supabase,
):
    """提取单文件所有字段（后台运行）"""
    # 单文件最长允许 15 分钟，防止卡死
    FILE_EXTRACTION_TIMEOUT = 900
    try:
        await asyncio.wait_for(
            _do_extract_single_file(
                task_id=task_id,
                file_id=file_id,
                file_path=file_path,
                file_name=file_name,
                mime_type=mime_type,
                fields=fields,
                prompt_set=prompt_set,
                model_config=model_config,
                supabase=supabase,
            ),
            timeout=FILE_EXTRACTION_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.error(f"❌ File extraction TIMED OUT after {FILE_EXTRACTION_TIMEOUT}s for file: {file_name} ({file_id})")
        try:
            await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extract_failed"}).eq("id", file_id).execute())
        except Exception as inner_e:
            logger.error(f"Failed to mark timed-out file as failed: {inner_e}")
    finally:
        # 所有单文件级工作（无论成功或报错）结束后，检查该任务下是否还有正在提取的文件
        # 若全部文件都已经完成（extracted 或 extract_failed 等），则汇总更新 tasks 表的状态
        try:
            resp = await asyncio.to_thread(lambda: supabase.table("files").select("status").eq("task_id", task_id).execute())
            statuses = [f.get("status") for f in (resp.data or [])]
            if "extracting" not in statuses and "uploading" not in statuses:
                # 汇总：只要有一个文件失败，任务就记为失败；全绿才算 success
                has_failure = any(s in ["extract_failed", "upload_failed"] for s in statuses)
                new_status = "extract_failed" if has_failure else "extracted"
                
                await asyncio.to_thread(lambda: supabase.table("tasks").update({"status": new_status}).eq("id", task_id).execute())
                logger.info(f"🏁 Task {task_id} aggregation: {new_status} (statuses: {set(statuses)})")
        except Exception as check_e:
            logger.error(f"Failed to aggregate task status: {check_e}")

async def _do_extract_single_file(
    task_id: str,
    file_id: str,
    file_path: str,
    file_name: str,
    mime_type: Optional[str],
    fields: list,
    prompt_set: dict,
    model_config: dict,
    supabase,
):
    """提取单文件所有字段（内部实现，带信号量保护）"""
    async with _system_semaphore:
        try:
            # 运行前检查
            if task_id in _terminated_tasks:
                logger.info(f"Task {task_id} already terminated. Skipping file {file_name}")
                return

            # 更新文件状态 → extracting
            await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extracting"}).eq("id", file_id).execute())

            # 【新增】：清理该文件旧的提取结果，确保这是一次“独立”且“覆盖式”的提取
            target_field_ids = [f["id"] for f in fields]
            if target_field_ids:
                await asyncio.to_thread(lambda: supabase.table("extraction_results").delete().eq("file_id", file_id).in_("field_id", target_field_ids).execute())
                logger.info(f"Cleared {len(target_field_ids)} previous results for file {file_name} before re-extraction")

            # 获取文件下载链接
            signed = supabase.storage.from_("files").create_signed_url(file_path, 3600)
            signed_url = signed.get("signedURL") or signed.get("signed_url") or (signed.get("data") or {}).get("signedUrl", "")

            if not signed_url:
                raise ValueError(f"Cannot get signed URL for file: {file_path}")

            # 【生产加固】：阶段日志记录
            logger.info(f"🔄 Task {task_id} | File {file_id} | Stage: START_DOWNLOAD")

            if task_id in _terminated_tasks: return

            # 获取文件最新详情（用于读取缓存的 ocr_result）
            file_resp = await asyncio.to_thread(lambda: supabase.table("files").select("*").eq("id", file_id).execute())
            if not file_resp.data:
                raise ValueError(f"File {file_id} not found in database")
            file_data = file_resp.data[0]

            name_lower = file_name.lower()
            is_image = any(name_lower.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]) or (mime_type and mime_type.startswith("image/"))
            is_pdf = name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type)

            ocr_blocks: list[dict] = []

            if is_image:
                # 图片文件：先尝试直接提取文本，再使用OCR
                logger.info(f"Processing image file: {file_name}")
                
                # 先尝试直接从图片中提取文本
                file_bytes = await download_file_bytes(signed_url)
                direct_text = await extract_text_from_file(file_bytes, file_name, mime_type)
                
                # 如果直接提取到了文本，就使用它
                if direct_text.strip():
                    logger.info(f"Using direct text extraction for image: {file_name}")
                    text_content = direct_text
                    ocr_blocks = []
                else:
                    # 检查是否有历史 OCR 结果并且包含 page_width 信息
                    ocr_res = file_data.get("ocr_result")
                    if ocr_res and isinstance(ocr_res, dict) and "blocks" in ocr_res:
                        blocks = ocr_res["blocks"]
                        # 检查是否包含 page_width，如果没有则是早期缓存，需要重跑
                        if blocks and "page_width" not in blocks[0]:
                            logger.info("Old OCR cache detected (missing page dimensions). Re-running OCR...")
                            ocr_res = None
                    else:
                        ocr_res = None

                    if ocr_res and isinstance(ocr_res, dict) and ocr_res.get("blocks"):
                        logger.info("Using cached OCR results")
                    else:
                        try:
                            logger.info(f"🔄 Task {task_id} | File {file_id} | Stage: OCR_START")
                            ocr_res = await run_ocr(signed_url)
                            # 缓存 OCR 结果
                            await asyncio.to_thread(lambda: supabase.table("files").update({"ocr_result": ocr_res}).eq("id", file_id).execute())
                        except Exception as e:
                            logger.error(f"OCR failed: {e}")
                            ocr_res = {"full_text": "", "blocks": []}

                    # 【纠正点】：获取全文和块，并进行可能的重构
                    text_content = ocr_res.get("full_text", "") if ocr_res else ""
                    ocr_blocks = ocr_res.get("blocks", []) if ocr_res else []
                    
                    if not text_content.strip() and ocr_blocks:
                        logger.info("Empty full_text detected but ocr_blocks exist. Reconstructing from blocks...")
                        text_content = "\n\n".join([b.get("block_content", "") for b in ocr_blocks if b.get("block_content")])
            elif is_pdf:
                # PDF文件：先尝试直接提取文本
                file_bytes = await download_file_bytes(signed_url)
                text_content = await extract_text_from_file(file_bytes, file_name, mime_type)
                
                # 判断是否为扫描版PDF（文本提取失败或文本量很少）
                if not text_content.strip() or len(text_content.strip()) < 100:
                    logger.info(f"Checking OCR cache for scanned PDF: {file_name}")
                    ocr_res = file_data.get("ocr_result")
                    if ocr_res and isinstance(ocr_res, dict) and "blocks" in ocr_res:
                        blocks = ocr_res["blocks"]
                        if blocks and "page_width" not in blocks[0]:
                            logger.info("Old OCR cache detected (missing page dimensions). Re-running OCR...")
                            ocr_res = None
                    else:
                        ocr_res = None

                    if ocr_res and isinstance(ocr_res, dict) and ocr_res.get("blocks"):
                        logger.info("Using cached OCR results for scanned PDF")
                    else:
                        try:
                            logger.info(f"Running OCR for scanned PDF: {file_name}")
                            ocr_res = await run_ocr(signed_url)
                            await asyncio.to_thread(lambda: supabase.table("files").update({"ocr_result": ocr_res}).eq("id", file_id).execute())
                        except Exception as e:
                            logger.error(f"OCR failed for PDF: {e}")
                            ocr_res = {"full_text": "", "blocks": []}
                            
                    text_content = ocr_res.get("full_text", "") if ocr_res else ""
                    ocr_blocks = ocr_res.get("blocks", []) if ocr_res else []

                    # 重构全文提示召回率
                    if not text_content.strip() and ocr_blocks:
                        text_content = "\n\n".join([b.get("block_content", "") for b in ocr_blocks if b.get("block_content")])
                else:
                    logger.info(f"Direct text extraction for editable PDF: {file_name}")
            else:
                # 其他文件类型（TXT/Docx 等）：先检查缓存以免重复解析
                ocr_res = file_data.get("ocr_result")
                if ocr_res and isinstance(ocr_res, dict) and ocr_res.get("full_text"):
                    logger.info(f"Using cached text for: {file_name}")
                    text_content = ocr_res["full_text"]
                else:
                    file_bytes = await download_file_bytes(signed_url)
                    text_content = await extract_text_from_file(file_bytes, file_name, mime_type)
                    # 缓存普通文本提取结果
                    if text_content.strip():
                        def update_text_cache():
                            supabase.table("files").update({"ocr_result": {"full_text": text_content}}).eq("id", file_id).execute()
                        await asyncio.to_thread(update_text_cache)

            if task_id in _terminated_tasks: return

            if not text_content.strip():
                logger.warning(f"No text extracted from file: {file_name}")
                await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extract_failed"}).eq("id", file_id).execute())
                logger.info(f"Marked file as extract_failed due to no text: {file_name}")
                return

            # 获取分段配置
            chunk_size = prompt_set.get("chunk_size", 2000)
            chunk_overlap = prompt_set.get("chunk_overlap", 200)
            
            separators = prompt_set.get("separators")
            if isinstance(separators, str):
                try:
                    separators = json.loads(separators)
                except Exception:
                    separators = None

            splitter = get_text_splitter(chunk_size, chunk_overlap, separators)
            chunks = splitter.split_text(text_content)
            logger.info(f"🔄 Task {task_id} | File {file_id} | Stage: TEXT_SPLIT_DONE | Chunks: {len(chunks)}")

            # 字段按 batch_id 分组
            field_groups: dict[str, list] = {}
            for f in fields:
                bid = f.get("batch_id") or "default_none"
                field_groups.setdefault(bid, []).append(f)

            extraction_passes = prompt_set.get("extraction_passes", 1)
            provider = model_config.get("provider", "openai")

            # -------------------------------------------------------
            # 提取核心：Ollama 串行 / OpenAI 可适度并发
            # Ollama 本地 GPU 串行由 llm_service._Ollama_SEMAPHORE 保证，
            # 这里 chunk_semaphore 只控制文件级别同时在处理的 chunk 数量。
            # Ollama：建议 2 并发（16G 显存跑 7B/9B 量化版绰绰有余）
            # OpenAI: 可以 10 并发
            # -------------------------------------------------------
            chunk_concurrency = 2 if provider == "ollama" else 10
            chunk_semaphore = asyncio.Semaphore(chunk_concurrency)

            async def process_chunk(c_idx: int, c_text: str, p_idx: int) -> list:
                """处理单个 chunk 的所有批次（顺序处理，避免同时打爆 Ollama）"""
                # 【生产加固】：多进程环境下的终止检查（除了内存 Set，增加一次 DB 状态确认）
                if task_id in _terminated_tasks:
                    return []
                
                # 每处理 5 个 chunk 检查一下 DB 状态（平衡性能与响应）
                if c_idx % 5 == 0:
                    try:
                        task_check = await asyncio.to_thread(lambda: supabase.table("tasks").select("status").eq("id", task_id).execute())
                        if task_check.data and task_check.data[0].get("status") == "extract_failed":
                            logger.info(f"🛑 Termination detected in DB for task {task_id}. Stopping chunk processing.")
                            _terminated_tasks.add(task_id)
                            return []
                    except Exception as e:
                        logger.warning(f"Failed to check task status in DB, continuing... {e}")

                async with chunk_semaphore:
                    logger.info(f"Pass {p_idx+1} | Chunk {c_idx+1}/{len(chunks)} started")
                    chunk_results = []

                    for group_fields in field_groups.values():
                        if task_id in _terminated_tasks:
                            return []
                        try:
                            results = await extract_grouped_fields(
                                provider=provider,
                                model_url=model_config["url"],
                                api_key=model_config.get("api_key", ""),
                                model_name=model_config.get("model_id") or model_config["name"],
                                temperature=model_config.get("temperature", 0.2),
                                top_p=model_config.get("top_p", 0.8),
                                text_content=c_text,
                                fields=group_fields,
                                system_prompt=prompt_set.get("system_prompt"),
                            )
                            for f in group_fields:
                                fid = f["id"]
                                res = results.get(fid)
                                if res and isinstance(res, dict):
                                    val = str(res.get("value", "")).strip()
                                    src = str(res.get("source", "")).strip()
                                    if val:
                                        chunk_results.append({
                                            "field_id": fid,
                                            "user_id": f["user_id"],
                                            "value": val,
                                            "source": src,
                                        })
                        except Exception as e:
                            logger.error(f"Chunk {c_idx+1} batch extraction error: {e}")
                    return chunk_results

            # 构建任务列表
            tasks = [
                process_chunk(i, text, p_idx)
                for p_idx in range(extraction_passes)
                for i, text in enumerate(chunks)
            ]

            # gather 所有 chunk，受 chunk_semaphore 控制并发
            # return_exceptions=True 防止单个 chunk 失败影响其他
            if tasks:
                raw_results = await asyncio.gather(*tasks, return_exceptions=True)
            else:
                raw_results = []

            if task_id in _terminated_tasks:
                return

            # --- 投票合并结果 ---
            field_candidates: dict[str, list] = {f["id"]: [] for f in fields}

            for chunk_res in raw_results:
                if isinstance(chunk_res, Exception):
                    logger.error(f"Chunk task raised exception: {chunk_res}")
                    continue
                if not chunk_res:
                    continue
                for item in chunk_res:
                    fid = item["field_id"]
                    if fid in field_candidates:
                        field_candidates[fid].append(item)

            # 批量保存，避免每个字段单独一个 to_thread
            upsert_rows = []
            for f in fields:
                fid = f["id"]
                candidates = field_candidates[fid]
                if not candidates:
                    continue

                counter = Counter(item["value"] for item in candidates)
                best_value = counter.most_common(1)[0][0]
                best_item = next(item for item in candidates if item["value"] == best_value)
                val = best_item["value"]
                src = best_item["source"]

                # BBox 定位
                bbox_data = None
                if val or src:
                    matched_block = None
                    if ocr_blocks:
                        # find_block_for_source is CPU bound (difflib), run in thread
                        matched_block = await asyncio.to_thread(find_block_for_source, src, ocr_blocks)

                    if not matched_block and is_pdf and file_bytes:
                        matched_block = await find_text_bbox_in_pdf_simple(file_bytes, src)
                    if matched_block:
                        bbox_data = {
                            "bbox": matched_block["block_bbox"],
                            "page": matched_block.get("page", 0),
                            "page_width": matched_block.get("page_width"),
                            "page_height": matched_block.get("page_height"),
                        }

                upsert_rows.append({
                    "file_id": file_id,
                    "field_id": fid,
                    "user_id": f["user_id"],
                    "value": val,
                    "llm_value": val,
                    "source": src,
                    "bbox": bbox_data,
                    "is_reviewed": False,
                })

            # 批量 upsert（一次 DB 往返，而非 N 次）
            if upsert_rows:
                rows_snapshot = upsert_rows  # 显式绑定，避免闭包捕获问题
                await asyncio.to_thread(
                    lambda rows=rows_snapshot: supabase.table("extraction_results").upsert(
                        rows, on_conflict="file_id,field_id"
                    ).execute()
                )

            # 更新文件状态 → extracted
            await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extracted"}).eq("id", file_id).execute())
            logger.info(f"✅ Extraction done for file: {file_name}")

        except Exception as e:
            if task_id in _terminated_tasks:
                logger.info(f"Suppressed error after termination for file {file_id}")
                return
            logger.error(f"❌ Extraction failed for file {file_id}: {e}")
            try:
                await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extract_failed"}).eq("id", file_id).execute())
            except Exception as inner_e:
                logger.error(f"Failed to update file status to failed: {inner_e}")


# ---------- 路由 ----------

@router.post("/start", response_model=ExtractResponse)
async def start_extraction(req: ExtractRequest, background_tasks: BackgroundTasks):
    """
    发起批量提取任务
    - file_ids 为空时，自动提取该 task 下所有文件
    - 每次调用均强制重新提取（无论历史状态）
    """
    supabase = get_supabase()
    
    # 【生产加固】：鉴权校验
    try:
        def check_task():
            return supabase.table("tasks").select("id, user_id").eq("id", req.task_id).execute()
        
        task_res = await asyncio.to_thread(check_task)
        if not task_res.data:
            raise HTTPException(status_code=404, detail="Task not found")
        if task_res.data[0].get("user_id") != req.user_id:
            logger.warning(f"Unauthorized extraction request: user {req.user_id} tried to access task {req.task_id}")
            raise HTTPException(status_code=403, detail="Unauthorized")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth check failed: {e}")
        # 鉴权服务异常时必须拒绝请求，不能静默继续
        raise HTTPException(status_code=503, detail="Auth service unavailable, please retry")

    # 查取 task 下所有文件
    files_resp = await asyncio.to_thread(lambda: supabase.table("files").select("*").eq("task_id", req.task_id).execute())
    all_files = files_resp.data or []
    if not all_files:
        raise HTTPException(status_code=404, detail="No files found for this task")

    # 筛选目标文件
    if req.file_ids:
        target_files = [f for f in all_files if f["id"] in req.file_ids]
    else:
        target_files = all_files

    # 查取提示词组字段
    fields_resp = await asyncio.to_thread(lambda: supabase.table("fields").select("*").eq("prompt_set_id", req.prompt_set_id).execute())
    fields = fields_resp.data or []
    if not fields:
        raise HTTPException(status_code=404, detail="No fields found for this prompt set")

    # 查取该用户激活的模型配置
    model_resp = await asyncio.to_thread(lambda: supabase.table("model_configs").select("*").eq("user_id", req.user_id).eq("is_active", True).execute())
    model_configs = model_resp.data or []
    if not model_configs:
        raise HTTPException(status_code=404, detail="No active model config found. Please activate a model in settings.")
    # 如果有多个激活的（异常情况），取最新的
    model_config = model_configs[0]


    # 查取提示词组信息（含分段配置）
    ps_resp = await asyncio.to_thread(lambda: supabase.table("prompt_sets").select("*").eq("id", req.prompt_set_id).execute())
    prompt_sets = ps_resp.data or []
    if not prompt_sets:
        raise HTTPException(status_code=404, detail="Prompt set not found")
    prompt_set = prompt_sets[0]

    # 开始前清理可能存在的终止标记
    if req.task_id in _terminated_tasks:
        _terminated_tasks.remove(req.task_id)

    # 将每个文件的提取加入后台任务
    for file in target_files:
        background_tasks.add_task(
            _extract_single_file,
            task_id=req.task_id,
            file_id=file["id"],
            file_path=file["path"],
            file_name=file["name"],
            mime_type=file.get("mime_type"),
            fields=fields,
            prompt_set=prompt_set,
            model_config=model_config,
            supabase=supabase,
        )

    # 更新 task 状态和 target files 状态
    await asyncio.to_thread(lambda: supabase.table("tasks").update({"status": "extracting", "prompt_set_id": req.prompt_set_id}).eq("id", req.task_id).execute())
    if target_files:
        target_ids = [f["id"] for f in target_files]
        await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extracting"}).in_("id", target_ids).execute())

        # 立即清理这些文件在本词组下的旧提取结果，避免用户在提取排队时看到旧数据产生”已完成但仍在转圈“的错觉
        target_field_ids = [f["id"] for f in fields]
        if target_field_ids:
            try:
                await asyncio.to_thread(lambda: supabase.table("extraction_results").delete().in_("file_id", target_ids).in_("field_id", target_field_ids).execute())
            except Exception as e:
                logger.error(f"Failed to preemptively clear extraction results: {e}")

    return ExtractResponse(
        task_id=req.task_id,
        queued_file_count=len(target_files),
        message=f"已将 {len(target_files)} 个文件加入提取队列，后台处理中...",
    )


@router.post("/terminate/{task_id}")
async def terminate_extraction(task_id: str, req: TerminateRequest):
    """
    终止正在进行的提取任务
    - 增加 user_id 校验，确保只有任务所有者可以执行终止操作
    """
    user_id = req.user_id
    supabase = get_supabase()
    
    # 鉴权：确认任务归属
    task_res = await asyncio.to_thread(lambda: supabase.table("tasks").select("user_id").eq("id", task_id).execute())
    if not task_res.data or task_res.data[0].get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized to terminate this task")

    # 记录终止标记
    _terminated_tasks.add(task_id)
    
    # 更新任务状态为失败（手动终止视为失败的一种）
    await asyncio.to_thread(lambda: supabase.table("tasks").update({"status": "extract_failed"}).eq("id", task_id).execute())
    
    # 更新该任务下所有正在提取的文件状态为失败
    await asyncio.to_thread(lambda: supabase.table("files").update({"status": "extract_failed"}).eq("task_id", task_id).eq("status", "extracting").execute())
    
    logger.info(f"User requested termination for task: {task_id}")
    return {"message": "已下发终止指令，正在停止后台处理"}


@router.post("/test-connection")
async def test_connection(req: TestConnectionRequest):
    """测试模型连接是否可用"""
    try:
        import time
        start_time = time.time()
        
        if req.provider == "ollama":
            import ollama
            host = req.url.replace("/v1", "") if req.url else None
            client = ollama.AsyncClient(host=host)
            
            # Ollama 连通性测试：调用 list 或发送一个简单 chat
            # 由于 list 可能会很多，我们就发一个简单的 chat
            response = await asyncio.wait_for(
                client.chat(
                    model=req.model_name,
                    messages=[{"role": "user", "content": "你好，请回答'ok'"}],
                    think=False,
                    format="json",
                    options={"temperature": 0}
                ),
                timeout=15.0
            )
            latency = int((time.time() - start_time) * 1000)
            return {
                "status": "success",
                "message": "连接成功 (Ollama)",
                "latency_ms": latency,
                "model": req.model_name
            }
        else:
            from openai import AsyncOpenAI
            import httpx
            
            client = AsyncOpenAI(
                api_key=req.api_key, 
                base_url=req.url,
                timeout=httpx.Timeout(15.0, connect=5.0)
            )
            
            # 发送一个极其简单的请求
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=req.model_name,
                    messages=[{"role": "user", "content": "hi"}],
                    max_tokens=1
                ),
                timeout=15.0
            )
            latency = int((time.time() - start_time) * 1000)
            
            return {
                "status": "success",
                "message": "连接成功",
                "latency_ms": latency,
                "model": req.model_name
            }
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "latency_ms": 0
        }


@router.get("/results/{file_id}")
async def get_extraction_results(file_id: str):
    """查询某个文件的所有字段提取结果"""
    supabase = get_supabase()

    results_resp = await asyncio.to_thread(lambda: supabase.table("extraction_results").select("*, fields(name, prompt, data_type)").eq("file_id", file_id).execute())
    results = results_resp.data or []

    # 顺带查文件状态
    file_resp = await asyncio.to_thread(lambda: supabase.table("files").select("id, status, name").eq("id", file_id).execute())
    file_info = (file_resp.data or [{}])[0]

    return {
        "file_id": file_id,
        "file_status": file_info.get("status", "unknown"),
        "results": results,
    }


class UpdateResultRequest(BaseModel):
    value: str

@router.put("/results/{file_id}/{field_id}")
async def update_extraction_result(file_id: str, field_id: str, req: UpdateResultRequest):
    """
    人工修改某个字段的提取结果
    这会更新 value，并将 is_reviewed 置为 true，但保留 llm_value 作为 ground truth 的对比参照。
    """
    supabase = get_supabase()
    try:
        def _update():
            # 优先更新现有行
            upd = supabase.table("extraction_results").update({
                "value": req.value,
                "is_reviewed": True,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("file_id", file_id).eq("field_id", field_id).execute()
            
            if len(upd.data) > 0:
                return upd
                
            # 若结果不存在（例如 LLM 提取时为空未插入），尝试兜底的新增
            file_meta = supabase.table("files").select("user_id").eq("id", file_id).execute()
            if not file_meta.data:
                raise Exception("文件记录已丢失")
                
            uid = file_meta.data[0]["user_id"]
            return supabase.table("extraction_results").upsert({
                "file_id": file_id,
                "field_id": field_id,
                "user_id": uid,
                "value": req.value,
                "is_reviewed": True,
                "updated_at": datetime.utcnow().isoformat()
            }, on_conflict="file_id,field_id").execute()
            
        resp = await asyncio.to_thread(_update)
        if not resp.data:
            raise HTTPException(status_code=404, detail="Upsert/Update failed with empty return")
            
        return {"status": "success", "message": "Manual edit saved successfully", "data": resp.data[0]}
    except Exception as e:
        logger.error(f"Failed to save manual edit: {e}")
        raise HTTPException(status_code=500, detail=str(e))
