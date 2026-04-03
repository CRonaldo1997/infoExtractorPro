# InfoExtractorPro 🚀

**InfoExtractorPro** 是一款基于大语言模型（LLM）和高精度 OCR 技术的行业领先文档信息提取平台。它旨在通过自动化的方式，从复杂的 PDF、扫描件、图片及 Word 文档中，精准提取结构化数据，并支持多轮校验与并发加速。

---

## ✨ 核心特性

- **📂 多格式支持**: 深度适配 PDF (多页)、扫描件、图片、Docx 及 TXT 格式。
- **🔍 混合 OCR 引擎**: 集成 PaddleOCR 高精度识别与 PyMuPDF 原生解析，确保文本定位精准。
- **🧠 智能批次提取**: 
  - 支持将字段分批提取，同批次字段在一次 LLM 调用中并行完成。
  - 支持跨 Batch 独立并行调用，显著提升处理速度。
- **⚙️ 多轮提取逻辑 (Multi-Pass)**: 支持对复杂文档进行多轮扫描，通过“早期退出”机制，在找齐字段后自动停止，兼顾准确度与 Token 成本。
- **🖼️ 全局 BBox 定位**: 提取结果可实时回溯到文档原文位置，支持高亮预览与 page-to-page 跳转。
- **🌐 云端部署就绪**: 完美适配 Vercel (Frontend) + Render (Backend) + Supabase (Database/Storage/Auth) 架构。

---

## 🛠️ 技术栈

### 前端 (Frontend)
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Authentication**: Supabase Auth

### 后端 (Backend)
- **Framework**: FastAPI (Python 3.11+)
- **Storage/DB**: Supabase (PostgreSQL & Storage)
- **OCR**: PaddleOCR (VL-1.5)
- **LLM**: OpenAI 兼容协议接口 (可适配 GPT-4, GLM-4, Claude 等)
- **Concurrency**: Asyncio (高并发异步处理)

### OLLAMA启动本地模型
OLLAMA_NUM_CTX=10000 ollama serve

---

## 🚀 快速开始

### 1. 环境准备
确保你已经配置好以下服务：
- [Supabase](https://supabase.com/) 项目（用于存储文件和数据库）
- 自定义 LLM API Key (支持 OpenAI 格式)

### 2. 克隆项目
```bash
git clone https://github.com/CRonaldo1997/infoExtractorPro.git
cd infoExtractorPro
```

### 3. 配置环境变量
**后端 (`/backend/.env`)**:
```env
SUPABASE_URL=你的Supabase项目URL
SUPABASE_SERVICE_ROLE_KEY=你的ServiceRoleKey
PADDLEOCR_TOKEN=你的PaddleOCR令牌
PADDLEOCR_JOB_URL=PaddleOCR接口地址
PADDLEOCR_MODEL=PaddleOCR-VL-1.5
```

**前端 (`/frontend/.env.local`)**:
```env
NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的AnonKey
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. 运行项目
**启动后端**:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**启动前端**:
```bash
cd frontend
npm install
npm run dev
```

---

## 📦 部署指南

### 前端 (Vercel)
1. 在 Vercel 中导入仓库下的 `frontend` 文件夹。
2. 配置 `NEXT_PUBLIC_` 开头的三个环境变量。
3. 构建命令：`npm run build`。

### 后端 (Render)
1. 在 Render 中创建 Web Service，指定 Root Directory 为 `backend`。
2. Start Command: `uvicorn main:app --host 0.0.0.0 --port 8000`。
3. 配置相应的环境参数。

---

## 🤝 参与贡献
如果你有任何改进建议或发现了 Bug，欢迎提交 Issue 或 Pull Request。

## 📄 开源协议
[MIT License](LICENSE)
