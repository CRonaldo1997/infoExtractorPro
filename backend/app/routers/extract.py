"""
提取任务路由
POST /api/v1/extract/start  - 发起提取
GET  /api/v1/extract/results/{file_id}  - 查询提取结果
"""
import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.supabase_client import get_supabase
from app.services.llm_service import extract_grouped_fields
from app.services.file_service import download_file_bytes, extract_text_from_file
from app.services.ocr_service import run_ocr, find_block_for_source, find_text_bbox_in_pdf_simple
from app.services.text_processor import get_text_splitter

logger = logging.getLogger(__name__)
router = APIRouter()

# 并发信号量：单用户同时最多 2 个，系统级最多 4 个
_system_semaphore = asyncio.Semaphore(4)

# 已终止任务集 (task_id -> bool)
_terminated_tasks = set()


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
    async with _system_semaphore:
        try:
            # 运行前检查
            if task_id in _terminated_tasks:
                logger.info(f"Task {task_id} already terminated. Skipping file {file_name}")
                return

            # 更新文件状态 → extracting
            supabase.table("files").update({"status": "extracting"}).eq("id", file_id).execute()

            # 获取文件下载链接
            signed = supabase.storage.from_("files").create_signed_url(file_path, 3600)
            signed_url = signed.get("signedURL") or signed.get("signed_url") or (signed.get("data") or {}).get("signedUrl", "")

            if not signed_url:
                raise ValueError(f"Cannot get signed URL for file: {file_path}")

            if task_id in _terminated_tasks: return

            # 获取文件最新详情（用于读取缓存的 ocr_result）
            file_resp = supabase.table("files").select("*").eq("id", file_id).execute()
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
                            logger.info(f"Running OCR for image: {file_name}")
                            ocr_res = await run_ocr(signed_url)
                            # 缓存 OCR 结果
                            supabase.table("files").update({"ocr_result": ocr_res}).eq("id", file_id).execute()
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
                            supabase.table("files").update({"ocr_result": ocr_res}).eq("id", file_id).execute()
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
                # 其他文件类型直接提取文本
                file_bytes = await download_file_bytes(signed_url)
                text_content = await extract_text_from_file(file_bytes, file_name, mime_type)

            if task_id in _terminated_tasks: return

            if not text_content.strip():
                logger.warning(f"No text extracted from file: {file_name}")
                # 如果没有提取到文本，直接更新状态为提取失败
                supabase.table("files").update({"status": "extract_failed"}).eq("id", file_id).execute()
                logger.info(f"Marked file as extract_failed due to no text: {file_name}")
                return

            # 获取分段配置
            chunk_size = prompt_set.get("chunk_size", 2000)
            chunk_overlap = prompt_set.get("chunk_overlap", 200)
            
            # 从 prompt_sets 表中获取 separators (预留字段)
            separators = prompt_set.get("separators")
            if isinstance(separators, str):
                try:
                    import json
                    separators = json.loads(separators)
                except:
                    separators = None

            splitter = get_text_splitter(chunk_size, chunk_overlap, separators)
            chunks = splitter.split_text(text_content)
            logger.info(f"Split text into {len(chunks)} chunks for {file_name}")

            # 字段分组
            field_groups = {}
            for f in fields:
                bid = f.get("batch_id") or "default_none"
                if bid not in field_groups:
                    field_groups[bid] = []
                field_groups[bid].append(f)

            # 获取提取轮数配置 (从 prompt_set 读取，默认 1)
            extraction_passes = prompt_set.get("extraction_passes", 1)
            # 用于追踪已找到值的字段 ID 集合
            filled_field_ids = set()

            # --- 提取核心逻辑 (支持批次并发与分段并发) ---
            async def process_chunk_v2(c_idx: int, c_text: str, p_idx: int):
                """处理单分段中的所有批次 (并发执行批次)"""
                if task_id in _terminated_tasks: return
                
                logger.info(f"Pass {p_idx+1} | Chunk {c_idx+1}/{len(chunks)} | Processing started...")
                
                # 收集该分段中所有待提取的批次
                batch_tasks = []
                batch_fields_map = []
                
                for bid, group_fields in field_groups.items():
                    # 过滤已命中字段
                    rem_fields = [f for f in group_fields if f["id"] not in filled_field_ids]
                    if not rem_fields:
                        continue
                        
                    batch_fields_map.append(rem_fields)
                    batch_tasks.append(extract_grouped_fields(
                        model_url=model_config["url"],
                        api_key=model_config["api_key"],
                        model_name=model_config["name"],
                        temperature=model_config.get("temperature", 0.2),
                        top_p=model_config.get("top_p", 0.8),
                        text_content=c_text,
                        fields=rem_fields,
                    ))
                
                if not batch_tasks:
                    return

                # 【批次级并发】: 同一个分块的所有批次请求同时发出
                all_results = await asyncio.gather(*batch_tasks)
                
                # 处理各组结果
                for b_idx, results in enumerate(all_results):
                    if task_id in _terminated_tasks: return
                    active_fields = batch_fields_map[b_idx]
                    
                    for f in active_fields:
                        fid = f["id"]
                        res = results.get(fid)
                        if not res or not isinstance(res, dict):
                            continue

                        val = str(res.get("value", "")).strip()
                        src = str(res.get("source", "")).strip()
                        
                        if val or src:
                            # 1. 定位 BBox
                            matched_block = find_block_for_source(src, ocr_blocks) if ocr_blocks else None
                            if not matched_block and is_pdf and file_bytes:
                                matched_block = find_text_bbox_in_pdf_simple(file_bytes, src)

                            bbox_data = None
                            if matched_block:
                                bbox_data = {
                                    "bbox": matched_block["block_bbox"],
                                    "page": matched_block.get("page", 0),
                                    "page_width": matched_block.get("page_width"),
                                    "page_height": matched_block.get("page_height")
                                }

                            # 2. 存入数据库
                            supabase.table("extraction_results").upsert({
                                "file_id": file_id,
                                "field_id": fid,
                                "user_id": f["user_id"],
                                "value": val,
                                "source": src,
                                "bbox": bbox_data,
                                "is_reviewed": False,
                            }, on_conflict="file_id,field_id").execute()
                            
                            filled_field_ids.add(fid)

            # --- 运行提取循环 ---
            for pass_idx in range(extraction_passes):
                if task_id in _terminated_tasks: break
                logger.info(f">>> Starting Extraction Pass {pass_idx + 1}/{extraction_passes} for {file_name}")

                # 【分段级并发控制】: 每组执行 2 个分段，兼顾性能与 token 节省
                CHUNK_STEP = 2
                for i in range(0, len(chunks), CHUNK_STEP):
                    if task_id in _terminated_tasks: break
                    
                    chunk_group = chunks[i : i + CHUNK_STEP]
                    tasks = [process_chunk_v2(i + idx, text, pass_idx) for idx, text in enumerate(chunk_group)]
                    
                    await asyncio.gather(*tasks)
                    
                    # 检查早期退出
                    if len(filled_field_ids) == len(fields):
                        logger.info(f"All fields found. Early exit at pass {pass_idx+1}, chunk group starting {i}.")
                        break
                
                if len(filled_field_ids) == len(fields):
                    break

            # 更新文件状态 → extracted
            supabase.table("files").update({"status": "extracted"}).eq("id", file_id).execute()
            logger.info(f"✅ Extraction done for file: {file_name}")

        except Exception as e:
            if task_id in _terminated_tasks:
                logger.info(f"Suppressed error after termination for file {file_id}")
                return
            logger.error(f"❌ Extraction failed for file {file_id}: {e}")
            supabase.table("files").update({"status": "extract_failed"}).eq("id", file_id).execute()


# ---------- 路由 ----------

@router.post("/start", response_model=ExtractResponse)
async def start_extraction(req: ExtractRequest, background_tasks: BackgroundTasks):
    """
    发起批量提取任务
    - file_ids 为空时，自动提取该 task 下所有文件
    - 每次调用均强制重新提取（无论历史状态）
    """
    supabase = get_supabase()

    # 查取 task 下所有文件
    files_resp = supabase.table("files").select("*").eq("task_id", req.task_id).execute()
    all_files = files_resp.data or []
    if not all_files:
        raise HTTPException(status_code=404, detail="No files found for this task")

    # 筛选目标文件
    if req.file_ids:
        target_files = [f for f in all_files if f["id"] in req.file_ids]
    else:
        target_files = all_files

    # 查取提示词组字段
    fields_resp = supabase.table("fields").select("*").eq("prompt_set_id", req.prompt_set_id).execute()
    fields = fields_resp.data or []
    if not fields:
        raise HTTPException(status_code=404, detail="No fields found for this prompt set")

    # 查取该用户激活的模型配置
    model_resp = supabase.table("model_configs").select("*").eq("user_id", req.user_id).eq("is_active", True).execute()
    model_configs = model_resp.data or []
    if not model_configs:
        raise HTTPException(status_code=404, detail="No active model config found. Please activate a model in settings.")
    # 如果有多个激活的（异常情况），取最新的
    model_config = model_configs[0]


    # 查取提示词组信息（含分段配置）
    ps_resp = supabase.table("prompt_sets").select("*").eq("id", req.prompt_set_id).execute()
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

    # 更新 task 状态
    supabase.table("tasks").update({"status": "extracting", "prompt_set_id": req.prompt_set_id}).eq("id", req.task_id).execute()

    return ExtractResponse(
        task_id=req.task_id,
        queued_file_count=len(target_files),
        message=f"已将 {len(target_files)} 个文件加入提取队列，后台处理中...",
    )


@router.post("/terminate/{task_id}")
async def terminate_extraction(task_id: str):
    """终止正在进行的提取任务"""
    supabase = get_supabase()
    
    # 记录终止标记
    _terminated_tasks.add(task_id)
    
    # 更新任务状态为失败（手动终止视为失败的一种）
    supabase.table("tasks").update({"status": "extract_failed"}).eq("id", task_id).execute()
    
    # 更新该任务下所有正在提取的文件状态为失败
    supabase.table("files").update({"status": "extract_failed"}).eq("task_id", task_id).eq("status", "extracting").execute()
    
    logger.info(f"User requested termination for task: {task_id}")
    return {"message": "已下发终止指令，正在停止后台处理"}


@router.get("/results/{file_id}")
async def get_extraction_results(file_id: str):
    """查询某个文件的所有字段提取结果"""
    supabase = get_supabase()

    results_resp = supabase.table("extraction_results").select("*, fields(name, prompt, data_type)").eq("file_id", file_id).execute()
    results = results_resp.data or []

    # 顺带查文件状态
    file_resp = supabase.table("files").select("id, status, name").eq("id", file_id).execute()
    file_info = (file_resp.data or [{}])[0]

    return {
        "file_id": file_id,
        "file_status": file_info.get("status", "unknown"),
        "results": results,
    }
