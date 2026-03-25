@echo off
echo ================================
echo  InfoEx Backend 启动脚本
echo ================================

REM 检查 .env 文件
if not exist .env (
    echo [错误] 未找到 .env 文件！
    echo 请复制 .env.example 并填写 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
    echo.
    echo 示例:
    echo   copy .env.example .env
    echo   然后编辑 .env 文件填写实际值
    pause
    exit /b 1
)

echo [OK] 找到 .env 配置文件
echo [启动] 激活 py311 conda 环境...

call conda activate py311

echo [启动] 运行 FastAPI 后端 (端口 8000)...
echo [提示] 前端需在 http://localhost:3000 运行
echo [提示] 按 Ctrl+C 停止服务
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info
