"""
PaddleOCR-VL 1.5 服务
异步 Job 模式：提交文件 → 轮询状态 → 下载 JSONL 结果

返回值：
  - full_text: str             拼接后的纯文本（按 block_order 排序）
  - blocks: list[dict]         各文字块的内容 + bbox，供源码匹配使用
"""
import asyncio
import json
import logging
import difflib
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# PaddleOCR-VL 1.5 API配置（参考文档中的正确配置）
JOB_URL   = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
TOKEN     = settings.PADDLEOCR_TOKEN
MODEL     = settings.PADDLEOCR_MODEL
HEADERS   = {"Authorization": f"bearer {TOKEN}"}
OPTIONAL  = {
    "useDocOrientationClassify": False,  # 关闭方向纠正（加速）
    "useDocUnwarping": False,            # 关闭扭曲纠正
    "useChartRecognition": False,        # 关闭图表识别
}

POLL_INTERVAL = 5   # 秒
MAX_WAIT_SEC  = 300 # 最长等待 5 分钟


async def _submit_job_by_url(signed_url: str) -> str:
    """通过在线 URL 提交 OCR Job（适配 Supabase 临时 signed URL）"""
    async with httpx.AsyncClient(timeout=30) as client:
        # 按照文档要求构建payload
        payload = {
            "fileUrl": signed_url,
            "model": MODEL,
            "optionalPayload": OPTIONAL
        }
        logger.info(f"Submitting OCR job with payload: {payload}")
        resp = await client.post(
            JOB_URL,
            headers={**HEADERS, "Content-Type": "application/json"},
            json=payload,
        )
        logger.info(f"OCR job response status: {resp.status_code}")
        logger.info(f"OCR job response content: {resp.text}")
        resp.raise_for_status()
        return resp.json()["data"]["jobId"]


async def _poll_job(job_id: str) -> str:
    """轮询 OCR 任务，返回结果 JSONL 下载链接"""
    waited = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while waited < MAX_WAIT_SEC:
            await asyncio.sleep(POLL_INTERVAL)
            waited += POLL_INTERVAL

            r = await client.get(f"{JOB_URL}/{job_id}", headers=HEADERS)
            r.raise_for_status()
            data = r.json()["data"]
            state = data["state"]

            if state == "done":
                return data["resultUrl"]["jsonUrl"]
            elif state == "failed":
                raise RuntimeError(f"OCR job failed: {data.get('errorMsg', 'unknown error')}")
            else:
                logger.debug(f"OCR job {job_id} state={state}")

    raise TimeoutError(f"OCR job {job_id} timed out after {MAX_WAIT_SEC}s")


async def _parse_jsonl(jsonl_url: str) -> tuple[str, list[dict]]:
    """下载并解析 JSONL 结果，返回全文 + 块列表"""
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.get(jsonl_url)
        resp.raise_for_status()

    full_text_parts: list[str] = []
    all_blocks: list[dict] = []
    page_num = 0

    for line in resp.text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        try:
            result = json.loads(line)["result"]
        except (json.JSONDecodeError, KeyError):
            continue

        # 根据 PaddleOCR 不同版本的返回结构进行鲁棒性解析
        result_data = result
        
        # 兼容两种常见的返回 key: layoutParsingResults (多页/多布局) 和 layoutParsingResult (单布局)
        layouts = result_data.get("layoutParsingResults") or result_data.get("layoutParsingResult")
        if not layouts and "markdown" in result_data:
            # 如果 result 直接就是布局对象
            layouts = [result_data]
        elif not layouts:
            # 尝试在更深层级寻找
            layouts = []

        for layout in (layouts if isinstance(layouts, list) else [layouts]):
            if not layout: continue
            
            # Markdown 文本（按 block_order 的流式文本）
            md_text = layout.get("markdown", {}).get("text", "")
            if md_text.strip():
                full_text_parts.append(md_text)

            # 获取页面尺寸 (用于前端缩放高亮叠加)
            page_w = layout.get("width") or layout.get("page_width")
            if not page_w and 'prunedResult' in layout:
                page_w = layout['prunedResult'].get("width") or layout['prunedResult'].get("page_width")
            
            page_h = layout.get("height") or layout.get("page_height")
            if not page_h and 'prunedResult' in layout:
                page_h = layout['prunedResult'].get("height") or layout['prunedResult'].get("page_height")

            # 带 bbox 的块（用于源码匹配 + 高亮定位）
            parsing_res = layout.get("prunedResult", {}) or layout.get("result", {})
            parsing_list = parsing_res.get("parsing_res_list", []) if isinstance(parsing_res, dict) else []
            
            for block in parsing_list:
                # 只收录正文块（block_order 不为 None）
                all_blocks.append({
                    "page": page_num,
                    "page_width": page_w,
                    "page_height": page_h,
                    "block_id": block.get("block_id"),
                    "block_order": block.get("block_order"),
                    "block_label": block.get("block_label", ""),
                    "block_content": block.get("block_content", ""),
                    "block_bbox": block.get("block_bbox", []),
                    "block_polygon_points": block.get("block_polygon_points", []),
                })

            page_num += 1

    full_text = "\n\n".join(full_text_parts)
    # 按 block_order 排序（None 的排后面）
    all_blocks.sort(key=lambda b: (b["block_order"] is None, b["block_order"] or 0))

    return full_text, all_blocks


async def run_ocr(signed_url: str) -> dict:
    """
    完整 OCR 流程入口
    传入 Supabase 临时签名 URL，返回：
    {
        "full_text": str,        # 全文文本（Markdown 格式，供 LLM 使用）
        "blocks": [              # 各文字块，供 source 匹配 + 高亮
            {
                "page": int,
                "block_content": str,
                "block_bbox": [x1, y1, x2, y2],
                "block_label": str,
                ...
            }
        ]
    }
    """
    try:
        logger.info(f"Submitting OCR job for URL: {signed_url[:60]}...")
        job_id = await _submit_job_by_url(signed_url)
        logger.info(f"OCR job submitted: {job_id}")

        jsonl_url = await _poll_job(job_id)
        logger.info(f"OCR job done: {job_id}, parsing result...")

        full_text, blocks = await _parse_jsonl(jsonl_url)
        logger.info(f"OCR parsed: {len(blocks)} blocks, {len(full_text)} chars")

        return {"full_text": full_text, "blocks": blocks}
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        # 返回空结果，避免整个提取流程失败
        return {"full_text": "", "blocks": []}


def find_block_for_source(source: str, blocks: list[dict]) -> Optional[dict]:
    """
    优化后的溯源逻辑 (借鉴 LangExtract Grounding 思想):
    通过滑动窗口模糊匹配检测 LLM 的 source 在全文中的位置，处理幻觉和多块跨越。
    """
    if not source or not source.strip() or not blocks:
        return None

    # 1. 预清洗：LLM 可能会在原文中加入多余的 \n 或空格，或者 case 不一致
    target = "".join(source.split()).lower()
    
    # 2. 构建带索引映射的全局搜索文本 (Searchable Text Buffer)
    full_text_buffer = ""
    # char_to_block_map[i] 存储 full_text_buffer 中第 i 个字符对应的 blocks 索引
    char_to_block_map = []
    
    for b_idx, block in enumerate(blocks):
        content = block.get("block_content", "") or ""
        if not content.strip():
            continue
        
        # 记录当前块在 buffer 中的起始位置
        full_text_buffer += content # 不再加空格，保持紧凑匹配
        
        # 填充映射图，直到当前的 buffer 长度
        while len(char_to_block_map) < len(full_text_buffer):
            char_to_block_map.append(b_idx)

    if not full_text_buffer:
        return None

    # 3. 滑动窗口模糊搜索 (Sliding Window Fuzzy Match)
    target_len = len(target)
    # 首先尝试在“无空格”版本中精确查找，提升速度 (此时 buffer 也是全紧凑的)
    full_text_lower = full_text_buffer.lower()
    exact_idx = full_text_lower.find(target)
    best_start, best_end, best_ratio = -1, -1, 0.0
    
    if exact_idx != -1:
        best_start, best_end, best_ratio = exact_idx, exact_idx + target_len, 1.0
    else:
        # 进阶模糊查找 (基于 difflib.SequenceMatcher)
        # 注意：这里 seq1 是 target，seq2 后续在循环中 set_seq2
        s_matcher = difflib.SequenceMatcher(None, target)
        
        # 性能优化：限制搜索步长。对极长文本，增加步长。
        # 由于去掉了 buffer 中的空格，索引位置会更密集。
        step = 1 if target_len < 50 else 2
        
        # 我们寻找最佳匹配的子串长度可能与 target 不一致（OCR 处理时可能有漏字多字）
        # 滑动窗口尝试 0.9x ~ 1.1x 的长度
        for i in range(0, len(full_text_lower) - target_len + 1, step):
            sub_len = target_len # 这里保持 target_len 即可，因为 buffer 已经压缩
            sub = full_text_lower[i : i + sub_len]
            
            s_matcher.set_seq2(sub)
            ratio = s_matcher.ratio()
            
            if ratio > best_ratio:
                best_ratio = ratio
                best_start, best_end = i, i + sub_len
                if ratio > 0.95: break # 足够好就停止

    # 4. 根据匹配范围提取对应的 Blocks
    if best_start != -1 and best_ratio > 0.7:  # 设定 0.7 相似度阈值
        # 确定受影响的块索引范围
        matched_indices = sorted(list(set(char_to_block_map[best_start : best_end])))
        if not matched_indices:
            return None
        
        # 选取第一个块作为基础元数据容器
        main_block = blocks[matched_indices[0]].copy()
        main_block["match_ratio"] = best_ratio # 附加相似度供前端参考或调试
        
        # 如果跨越了多个块，计算这些块的 BBox 并集 (Bounding Box Union)
        if len(matched_indices) > 1:
            all_bboxes = [
                blocks[idx]["block_bbox"] 
                for idx in matched_indices 
                if blocks[idx].get("block_bbox") and len(blocks[idx]["block_bbox"]) == 4
            ]
            if all_bboxes:
                x0 = min(b[0] for b in all_bboxes)
                y0 = min(b[1] for b in all_bboxes)
                x1 = max(b[2] for b in all_bboxes)
                y1 = max(b[3] for b in all_bboxes)
                main_block["block_bbox"] = [x0, y0, x1, y1]
        
        return main_block

    return None

async def find_text_bbox_in_pdf_simple(file_bytes: bytes, source: str) -> Optional[dict]:
    import asyncio
    return await asyncio.to_thread(_find_text_bbox_in_pdf_simple_sync, file_bytes, source)

def _find_text_bbox_in_pdf_simple_sync(file_bytes: bytes, source: str) -> Optional[dict]:
    """
    针对可编辑 PDF，使用 PyMuPDF 获取文字块并进行模糊匹配。
    这比 search_for 更能处理 PDF 中的异常空格/换行。
    """
    if not source or not source.strip():
        return None
    
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        # 将 PDF 文字块转换为“虚拟 OCR 块”
        virtual_blocks = []
        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            page_rect = page.rect
            blocks = page.get_text("blocks")
            for b in blocks:
                # b = (x0, y0, x1, y1, "text", block_no, block_type)
                virtual_blocks.append({
                    "block_content": b[4],
                    "block_bbox": [b[0], b[1], b[2], b[3]],
                    "page": page_num,
                    "page_width": page_rect.width,
                    "page_height": page_rect.height
                })
        
        doc.close()
        
        # 使用现有的模糊匹配逻辑
        return find_block_for_source(source, virtual_blocks)
        
    except Exception as e:
        logger.error(f"Error searching text blocks in PDF: {e}")
    
    return None
