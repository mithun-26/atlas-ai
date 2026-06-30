# Atlas AI

> **Enterprise Multimodal Agentic RAG Platform**

Atlas AI is a full-stack AI platform that enables users to upload PDFs, DOCX files, and images, then interact with them using natural language. It combines multimodal understanding, hybrid retrieval, and agentic reasoning to generate accurate, source-grounded responses with real-time streaming.

---

##  Features

-  Upload and analyze **PDF, DOCX, and Image** files
-  Conversational AI powered by **Google Gemini 2.5 Flash**
-  Multi-Agent workflow using **LangGraph**
-  Hybrid Retrieval (Vector Search + Keyword Search)
-  Source-grounded responses with citations
-  OCR + Vision AI for image understanding
-  Real-time streaming responses (SSE)
-  Conversation memory
-  Fully Dockerized deployment

---

##  Architecture

```text
                 +----------------------+
                 |    React Frontend    |
                 +----------+-----------+
                            |
                      REST + SSE
                            |
                 +----------v-----------+
                 |    FastAPI Backend   |
                 +----------+-----------+
                            |
                  LangGraph Agent Pipeline
                            |
       +--------------------+--------------------+
       |                    |                    |
  Planner Agent      Retrieval Agent      Memory Agent
       |                    |                    |
       +--------------------+--------------------+
                            |
            +---------------+---------------+
            |                               |
         MongoDB                    Qdrant Vector DB
```
# Agent Workflow

Every user query passes through an intelligent multi-agent pipeline:

1. Planner Agent
2. Document Agent
3. Vision Agent
4. Retrieval Agent
5. Memory Agent
6. Reasoning Agent
7. Citation Agent

The pipeline gathers relevant context, prepares reasoning prompts, retrieves supporting evidence, and streams grounded responses back to the user.

---

##  Tech Stack

### Frontend
- React
- Tailwind CSS
- shadcn/ui

### Backend
- FastAPI
- LangGraph
- Google Gemini 2.5 Flash
- MongoDB
- Qdrant
- PyMuPDF
- python-docx
- Tesseract OCR

### DevOps
- Docker
- Docker Compose

---

## ⚙️ Quick Start

Clone the repository

```bash
git clone https://github.com/mithun-26/atlas-ai.git
cd atlas-ai
```

Create a `.env` file in the project root using `.env.example` and add your Google Gemini API key.

Run the application

```bash
docker compose up --build
```

Application URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |
| Swagger Docs | http://localhost:8001/docs |

---

##  Author

**Mithun K A**

Artificial Intelligence & Machine Learning Engineer

- GitHub: https://github.com/mithun-26

---
