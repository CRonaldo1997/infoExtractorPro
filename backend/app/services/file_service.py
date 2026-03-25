"""
文件文本提取服务 - 从 Supabase Storage 下载文件并提取纯文本
支持：txt、docx（python-docx），PDF/图片暂时返回提示（OCR 后续接入）
"""
import logging
import io
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


async def download_file_bytes(signed_url: str) -> bytes:
    """下载 Supabase Storage 中的文件内容"""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(signed_url)
        resp.raise_for_status()
        return resp.content


async def extract_text_from_file(
    file_bytes: bytes,
    file_name: str,
    mime_type: Optional[str] = None,
) -> str:
    """
    从文件内容中提取纯文本
    - txt：直接 decode
    - docx：使用 python-docx
    - pdf/图片：暂时返回空（后续接 OCR）
    """
    name_lower = file_name.lower()

    if name_lower.endswith(".txt") or (mime_type and "text/plain" in mime_type):
        for enc in ("utf-8", "gbk", "gb2312", "utf-16"):
            try:
                return file_bytes.decode(enc)
            except UnicodeDecodeError:
                continue
        return file_bytes.decode("utf-8", errors="replace")

    if name_lower.endswith(".docx"):
        try:
            import docx  # python-docx
            doc = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            logger.warning("python-docx not installed, cannot extract docx text")
            return ""
        except Exception as e:
            logger.error(f"docx extraction error: {e}")
            return ""

    # PDF - 使用 PyMuPDF 直接提取文本
    if name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type):
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=io.BytesIO(file_bytes), filetype="pdf")
            text_parts = []
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    text_parts.append(text)
            doc.close()
            return "\n\n".join(text_parts)
        except ImportError:
            logger.warning("PyMuPDF not installed, cannot extract PDF text")
            return ""
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return ""

    if any(name_lower.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]):
        try:
            import fitz  # PyMuPDF
            # 尝试使用PyMuPDF从图片中提取文本
            doc = fitz.open(stream=io.BytesIO(file_bytes), filetype=name_lower.split('.')[-1])
            text_parts = []
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    text_parts.append(text)
            doc.close()
            text = "\n\n".join(text_parts)
            logger.info(f"Extracted {len(text)} characters from image: {file_name}")
            return text
        except ImportError:
            logger.warning("PyMuPDF not installed, cannot extract image text")
            return ""
        except Exception as e:
            logger.error(f"Image text extraction error: {e}")
            return ""

    return ""
