from fastapi import APIRouter, HTTPException, Response
import fitz  # PyMuPDF
import httpx
import io
from app.supabase_client import get_supabase
from app.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/pdf-page")
async def get_pdf_page(file_path: str, page_num: int = 0, dpi: int = None):
    # 使用配置文件中的DPI设置
    if dpi is None:
        dpi = settings.DPI
    """
    下载 PDF 并渲染指定页为图片
    - file_path: Supabase storage 路径
    - page_num: 页码 (0-based)
    - dpi: 渲染分辨率 (默认200，对齐 PaddleOCR 内部的默认 200 DPI)
    """
    supabase = get_supabase()
    
    try:
        # 获取签名链接
        signed = supabase.storage.from_("files").create_signed_url(file_path, 3600)
        signed_url = signed.get("signedURL") or signed.get("signed_url") or (signed.get("data") or {}).get("signedUrl", "")
        
        if not signed_url:
            raise HTTPException(status_code=404, detail="File not found")
            
        # 下载 PDF
        async with httpx.AsyncClient() as client:
            resp = await client.get(signed_url)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to download PDF")
            
            pdf_bytes = resp.content
            
        # 使用 fitz 渲染
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if page_num >= doc.page_count:
            raise HTTPException(status_code=400, detail="Page number out of range")
            
        page = doc.load_page(page_num)
        
        # 渲染为图片 (RGB)
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
        img_bytes = pix.tobytes("jpg")
        
        doc.close()
        
        return Response(content=img_bytes, media_type="image/jpeg")
        
    except Exception as e:
        logger.error(f"Error rendering PDF page: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/text/{file_id}")
async def get_file_text(file_id: str):
    """
    获取文件的纯文本/Markdown 内容，用于前端高亮
    """
    supabase = get_supabase()
    res = supabase.table("files").select("name, path, mime_type, ocr_result").eq("id", file_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_data = res.data[0]
    
    # 优先从 OCR 结果中获取全文
    ocr_result = file_data.get("ocr_result")
    if ocr_result and isinstance(ocr_result, dict) and "blocks" in ocr_result:
        full_text = "\n".join([b.get("block_content", "") for b in ocr_result["blocks"]])
        if full_text.strip():
            return {"text": full_text}
            
    # 如果没有 OCR 结果，尝试直接从存储中下载并解析
    try:
        from app.services.file_service import download_file_bytes, extract_text_from_file
        file_path = file_data["path"]
        signed = supabase.storage.from_("files").create_signed_url(file_path, 3600)
        signed_url = signed.get("signedURL") or signed.get("signed_url") or (signed.get("data") or {}).get("signedUrl", "")
        
        if signed_url:
            file_bytes = await download_file_bytes(signed_url)
            text = await extract_text_from_file(file_bytes, file_data["name"], file_data["mime_type"])
            return {"text": text}
    except Exception as e:
        logger.error(f"Failed to extract text for preview: {e}")
        
    return {"text": ""}

