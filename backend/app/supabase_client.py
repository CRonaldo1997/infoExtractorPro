"""Supabase 客户端工具（使用 service role key，绕过 RLS，供后端调用）"""
from supabase import create_client, Client
from app.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def get_signed_url(supabase: Client, bucket: str, file_path: str, expires_in: int = 3600) -> str:
    """
    获取 Supabase Storage 签名 URL，兼容不同版本 SDK 的返回结构差异。
    失败时返回空字符串。
    """
    signed = supabase.storage.from_(bucket).create_signed_url(file_path, expires_in)
    return (
        signed.get("signedURL")
        or signed.get("signed_url")
        or (signed.get("data") or {}).get("signedUrl", "")
    )
