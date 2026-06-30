# Atlas AI

**Enterprise Multimodal Agentic RAG Platform**

Atlas AI lets you upload PDFs, DOCX files, and images, then ask questions about them.
It retrieves relevant context using hybrid search (Qdrant dense vectors + MongoDB BM25 + Reciprocal Rank Fusion), orchestrates a seven-node LangGraph agent pipeline, and streams grounded answers with inline source citations.

---

## What it does

Upload a contract, a technical spec, and a screenshot.
Then ask:

- *"Summarize this document."*
- *"What projects are mentioned?"*
- *"Explain this architecture diagram."*
- *"Compare the two uploaded PDFs."*

Atlas AI retrieves the right chunks, classifies your intent, and streams a Markdown answer that cites every claim back to a source: `[Source 1]`, `[Source 2]`, etc.

---

## Features

| Category | Details |
|---|---|
| **Document ingestion** | PDF (PyMuPDF), DOCX (python-docx), Images (Tesseract OCR + Gemini Vision) |
| **Chunking** | Sentence-boundary-aware sliding window (800 chars, 150 overlap) |
| **Embeddings** | scikit-learn HashingVectorizer (384-dim, stateless) |
| **Vector search** | Qdrant in-memory, cosine similarity |
| **Keyword search** | MongoDB text index (BM25-equivalent) |
| **Retrieval fusion** | Reciprocal Rank Fusion across dense + BM25 + regex fallback |
| **Agent orchestration** | LangGraph `StateGraph` with 7 compiled nodes |
| **LLM** | OpenAI GPT-5.4 via Emergent universal key |
| **Vision** | Gemini 3 Flash Preview for image analysis at upload time |
| **Streaming** | Server-Sent Events (SSE) — token-by-token |
| **Conversation memory** | Auto-summarization when history exceeds 6 messages |
| **Document management** | Per-document selection, bulk delete, retrieval filtering |
| **Frontend** | React 19, TailwindCSS, shadcn/ui, Phosphor icons, react-markdown |

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│                         React Frontend                           │
│  DocumentPanel  │       ChatPanel       │   CitationsPanel       │
│  (upload, select│  (SSE stream, markdown │  (source cards,       │
│   search, delete│   conversation mgmt)  │   retrieval method)    │
└────────┬────────┴───────────┬───────────┴────────────────────────┘
         │                    │ POST /api/chat (SSE)
         │ REST               │
         ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Compiled LangGraph StateGraph                 │  │
│  │                                                            │  │
│  │  START → PlannerAgent → DocumentAgent → VisionAgent        │  │
│  │          → RetrievalAgent → MemoryAgent → ReasoningAgent   │  │
│  │          → CitationAgent → END                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Document Processing    │  Hybrid Retrieval   │  LLM Streaming   │
│  (parse → chunk → embed │  (Qdrant + BM25     │  (Emergent key,  │
│   → Qdrant + MongoDB)   │   + RRF reranking)  │   GPT-5.4 SSE)   │
└──────────┬──────────────┴─────────┬───────────┴──────────────────┘
           │                        │
     ┌─────▼─────┐           ┌──────▼──────┐
     │  MongoDB   │           │   Qdrant    │
     │ (documents,│           │ (in-memory  │
     │  chunks,   │           │  384-dim    │
     │  convos)   │           │  vectors)   │
     └───────────┘           └─────────────┘
```

Full architecture documentation: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TailwindCSS, shadcn/ui, Phosphor icons, react-markdown, remark-gfm |
| Backend | FastAPI, Python 3.11+, Motor (async MongoDB), Pydantic v2 |
| Orchestration | LangGraph 1.2.6 (`StateGraph`, `CompiledStateGraph`) |
| Vector DB | Qdrant (in-memory, cosine, 384-dim) |
| Metadata DB | MongoDB |
| AI / LLM | OpenAI GPT-5.4, Gemini 3 Flash Preview (vision) via Emergent universal key |
| OCR | Tesseract 5.3 |
| Document parsing | PyMuPDF, python-docx, Pillow |
| Embeddings | scikit-learn HashingVectorizer |
| Deployment | Docker Compose (frontend + backend + MongoDB) |

---

## Quick start

### Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env — set your EMERGENT_LLM_KEY

make up          # docker compose up --build -d
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8001
# Health:    http://localhost:8001/api/health
```

### Local development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (separate terminal)
cd frontend
yarn install
yarn start
```

### Verify

```bash
curl http://localhost:8001/api/health
# {"status":"healthy","version":"2.0.0","documents_count":0,"chunks_count":0}
```

---

## API reference (summary)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Upload PDF / DOCX / image |
| `GET` | `/api/documents` | List all documents (with `selected` field) |
| `DELETE` | `/api/documents/{id}` | Delete single document |
| `POST` | `/api/documents/delete-bulk` | Delete multiple documents |
| `PATCH` | `/api/documents/select` | Toggle document selection |
| `POST` | `/api/chat` | Chat via LangGraph pipeline (SSE stream) |
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/conversations/{id}` | Get conversation with messages |
| `DELETE` | `/api/conversations/{id}` | Delete conversation |
| `GET` | `/api/health` | Health check |

Full API documentation with request/response schemas: [`docs/API.md`](docs/API.md)

---

## Project structure

```
atlas-ai/
├── backend/
│   ├── server.py              # FastAPI app — all routes, services, LangGraph
│   ├── uploads/               # Local file storage (per-document subdirectories)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       ├── test_atlas_api.py
│       ├── test_atlas_v2_features.py
│       └── test_doc_management.py
├── frontend/
│   ├── src/
│   │   ├── App.js             # Root — 3-column layout, SSE handler, state
│   │   ├── App.css            # Markdown prose, animations, typing cursor
│   │   ├── index.css          # CSS variables (dark theme), fonts
│   │   ├── components/
│   │   │   ├── DocumentPanel.jsx   # Upload, selection, bulk actions, delete
│   │   │   ├── ChatPanel.jsx       # Streaming chat, context indicator
│   │   │   └── CitationsPanel.jsx  # Source cards, retrieval metadata
│   │   ├── components/ui/     # shadcn/ui primitives
│   │   └── constants/testIds.js
│   ├── tailwind.config.js
│   ├── Dockerfile
│   └── nginx.conf
├── docs/
│   ├── ARCHITECTURE.md
│   └── API.md
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

---

## LangGraph agent pipeline

Every `/api/chat` request executes this compiled graph:

```
 ┌─────────────────┐
 │   PlannerAgent   │  Classify intent (summarize / compare / extract / explain / search / general)
 │                  │  Extract optimised search query and key entities via LLM
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │  DocumentAgent   │  Resolve selected document IDs for retrieval filtering
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │   VisionAgent    │  Flag whether the query involves visual content
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │ RetrievalAgent   │  Qdrant dense search → MongoDB BM25 → Reciprocal Rank Fusion
 │                  │  Filtered by selected document_ids when provided
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │   MemoryAgent    │  If conversation > 6 messages: LLM-summarise older messages
 │                  │  Keep recent 4 messages intact
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │ ReasoningAgent   │  Assemble system prompt with context, memory, intent, citations rules
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │  CitationAgent   │  Structure citation metadata for the frontend
 └─────────────────┘

After the graph returns, the chat endpoint streams the LLM response (GPT-5.4)
token-by-token via SSE using the ReasoningAgent's prepared system prompt.
```

**State schema** — `AgentState(TypedDict)`:

| Field | Set by | Type |
|---|---|---|
| `user_query` | Input | `str` |
| `conversation_id` | Input | `str` |
| `selected_document_ids` | Input | `list` |
| `conversation_messages` | Input | `list` |
| `plan` | PlannerAgent | `dict` |
| `document_ids` | DocumentAgent | `list \| None` |
| `needs_vision` | VisionAgent | `bool` |
| `retrieved_chunks` | RetrievalAgent | `list` |
| `sources` | RetrievalAgent | `list` |
| `conversation_summary` | MemoryAgent | `str` |
| `reasoning_context` | ReasoningAgent | `str` |
| `citations` | CitationAgent | `list` |

---

## Document processing pipeline

```
Upload (multipart) → Save to disk → Background task:
  ├── PDF  → PyMuPDF page extraction
  ├── DOCX → python-docx paragraph + table extraction
  └── Image → Tesseract OCR + Gemini Vision analysis
       ↓
  Sentence-aware chunking (800 char, 150 overlap)
       ↓
  MongoDB insert (chunks collection, text index)
       ↓
  HashingVectorizer → 384-dim embedding
       ↓
  Qdrant upsert (in-memory, cosine)
       ↓
  Document status → "ready"
```

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `MONGO_URL` | backend/.env | MongoDB connection string |
| `DB_NAME` | backend/.env | Database name |
| `EMERGENT_LLM_KEY` | backend/.env | Universal LLM key (OpenAI + Gemini) |
| `CORS_ORIGINS` | backend/.env | Allowed origins |
| `REACT_APP_BACKEND_URL` | frontend/.env | Backend URL for API calls |

---

## Testing

```bash
# Run all backend tests
cd backend && pytest tests/ -v

# Individual test suites
pytest tests/test_atlas_api.py -v          # Core API tests
pytest tests/test_atlas_v2_features.py -v  # Qdrant, agent pipeline, hybrid retrieval
pytest tests/test_doc_management.py -v     # Selection, bulk delete, filtering
```

---

## Makefile targets

```
make up              # docker compose up --build -d
make down            # docker compose down
make build           # docker compose build
make test            # pytest backend tests
make logs            # docker compose logs -f
make clean           # Remove volumes and uploads
make dev-backend     # uvicorn --reload (no Docker)
make dev-frontend    # yarn start (no Docker)
```

---

## License

MIT
