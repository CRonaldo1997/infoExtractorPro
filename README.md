# infoExtractorPro

A professional document information extraction system based on OCR and LLM.

## Features
- **OCR Engine**: Powered by PaddleOCR-VL-1.5.
- **LLM Extraction**: Core logic for high-accuracy fields extraction.
- **Frontend**: Built with Next.js 15.
- **Backend**: Built with FastAPI.

## Getting Started

### Prerequisites
- Conda (py311 environment)
- Node.js (Latest stable)

### Backend
1. `cd backend`
2. `conda activate py311`
3. `uvicorn main:app --reload`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`
