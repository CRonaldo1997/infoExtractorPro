"""应用配置 - 从环境变量加载"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # PaddleOCR-VL 1.5
    PADDLEOCR_TOKEN: str = os.getenv("PADDLEOCR_TOKEN", "")
    PADDLEOCR_JOB_URL: str = os.getenv("PADDLEOCR_JOB_URL", "https://www.paddleocr.com/api/v1/ocr")
    PADDLEOCR_MODEL: str = os.getenv("PADDLEOCR_MODEL", "PaddleOCR-VL-1.5")
    
    # 统一DPI设置
    DPI: int = int(os.getenv("DPI", "200"))

    def validate(self):
        if not self.SUPABASE_URL:
            raise ValueError("SUPABASE_URL is not set")
        if not self.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is not set")
        if not self.PADDLEOCR_TOKEN:
            raise ValueError("PADDLEOCR_TOKEN is not set")


settings = Settings()
