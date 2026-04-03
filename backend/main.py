"""
InfoEx 后端 FastAPI 应用
负责 OCR + LLM 的信息提取核心业务逻辑
"""
import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import extract, preview

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 InfoEx Backend starting up...")
    yield
    logger.info("🛑 InfoEx Backend shutting down...")


app = FastAPI(
    title="InfoEx Backend API",
    description="基于 OCR + 大模型的信息提取系统后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

# 从环境变量加载允许的来源列表，生产环境必备
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,  # 生产环境通常需要跨域 Cookie 或 Auth Header
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract.router, prefix="/api/v1/extract", tags=["extract"])
app.include_router(preview.router, prefix="/api/v1/preview", tags=["preview"])


@app.get("/")
async def root():
    return {"message": "InfoEx Backend API is running", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
