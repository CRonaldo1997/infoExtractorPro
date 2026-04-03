from fastapi import APIRouter, HTTPException, Response
import fitz  # PyMuPDF
import httpx
import io
import logging
import asyncio
from typing import Optional
from cachetools import TTLCache

from app.supabase_client import get_supabase, get_signed_url
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# 进程内 PDF 字节流缓存：最近 10 个文件，每个缓存 300 秒 (5分钟)
# 防止翻页时重复从云端下载巨型 PDF 文件
pdf_cache = TTLCache(maxsize=10, ttl=300)

async def _get_pdf_bytes(file_path: str) -> bytes:
    """内部辅助：带缓存的文件下载逻辑"""
    if file_path in pdf_cache:
        logger.debug(f"Cache HIT for PDF: {file_path}")
        return pdf_cache[file_path]
    
    supabase = get_supabase()
    signed_url = get_signed_url(supabase, "files", file_path)
    if not signed_url:
        raise HTTPException(status_code=404, detail="File NOT found prefix")

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(signed_url)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to download from Cloud Storage")
        
        pdf_data = resp.content
        pdf_cache[file_path] = pdf_data
        logger.info(f"Cache MISS. Downloaded and cached PDF: {file_path} ({len(pdf_data)} bytes)")
        return pdf_data

@router.get("/pdf-page-count")
async def get_pdf_page_count(file_path: str):
    """返回 PDF 总页数"""
    try:
        pdf_bytes = await _get_pdf_bytes(file_path)

        def count_pages(data):
            doc = fitz.open(stream=data, filetype="pdf")
            n = doc.page_count
            doc.close()
            return n

        total = await asyncio.to_thread(count_pages, pdf_bytes)
        return {"page_count": total}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PDF page count: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pdf-page")
async def get_pdf_page(file_path: str, page_num: int = 0, dpi: int = None):
    # 使用配置文件中的DPI设置
    if dpi is None:
        dpi = settings.DPI
    """
    渲染指定页为图片
    - page_num: 页码 (0-based)
    - dpi: 渲染分辨率 (默认对齐 PaddleOCR 内部的默认 200 DPI)
    """
    try:
        pdf_bytes = await _get_pdf_bytes(file_path)
            
        # 使用 fitz 渲染，移至新线程防阻塞
        def render_page(pdf_data, p_num, out_dpi):
            import fitz
            doc = fitz.open(stream=pdf_data, filetype="pdf")
            if p_num >= doc.page_count:
                doc.close()
                raise ValueError("Page index out of range")
            page = doc.load_page(p_num)
            # 根据目标 DPI 缩放矩阵
            zoom = out_dpi / 72
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            res_bytes = pix.tobytes("jpg")
            doc.close()
            return res_bytes

        img_bytes = await asyncio.to_thread(render_page, pdf_bytes, page_num, dpi)
        return Response(content=img_bytes, media_type="image/jpeg")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rendering PDF page: {e}")
        if isinstance(e, ValueError):
            raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/text/{file_id}")
async def get_file_text(file_id: str):
    """
    获取文件的纯文本内容，用于前端高亮溯源
    """
    supabase = get_supabase()
    
    res = await asyncio.to_thread(lambda: supabase.table("files").select("id, name, path, mime_type, ocr_result").eq("id", file_id).execute())
    if not res.data:
        raise HTTPException(status_code=404, detail="File NOT found in database")
    
    file_data = res.data[0]
    ocr_result = file_data.get("ocr_result") or {}
    
    # 1. 如果 ocr_result 中已经有 full_text，直接返回
    if isinstance(ocr_result, dict) and ocr_result.get("full_text", "").strip():
        return {"text": ocr_result["full_text"]}
        
    # 2. 如果只有 blocks，尝试拼接并回填
    if isinstance(ocr_result, dict) and ocr_result.get("blocks"):
        full_text = "\n".join([b.get("block_content", "") for b in ocr_result["blocks"]])
        if full_text.strip():
            # 异步回填到 DB 优化下次访问
            ocr_result["full_text"] = full_text
            asyncio.create_task(asyncio.to_thread(lambda: supabase.table("files").update({"ocr_result": ocr_result}).eq("id", file_id).execute()))
            return {"text": full_text}
            
    # 3. 如果都没有，进行实时文本解析
    try:
        from app.services.file_service import download_file_bytes, extract_text_from_file
        file_path = file_data["path"]
        signed_url = get_signed_url(supabase, "files", file_path)
        
        if signed_url:
            file_bytes = await download_file_bytes(signed_url)
            text = await extract_text_from_file(file_bytes, file_data["name"], file_data["mime_type"])
            
            if text.strip():
                if not isinstance(ocr_result, dict): ocr_result = {}
                ocr_result["full_text"] = text
                asyncio.create_task(asyncio.to_thread(lambda: supabase.table("files").update({"ocr_result": ocr_result}).eq("id", file_id).execute()))
                
            return {"text": text}
    except Exception as e:
        logger.error(f"Failed to extract text for preview: {e}")
        
    return {"text": ""}

