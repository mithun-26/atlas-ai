# Atlas AI - Product Requirements Document

## Original Problem Statement
Build Atlas AI — an Enterprise Multimodal Agentic RAG Platform. Users upload PDF, DOCX, and image files and ask questions about them. The system retrieves relevant multimodal context and generates grounded answers with citations via SSE streaming.

## Architecture
- **Frontend**: React 19 + TailwindCSS + shadcn/ui + Phosphor Icons + React Markdown
- **Backend**: FastAPI (Python) + MongoDB + Emergent LLM Integration
- **AI**: OpenAI GPT-5.4 (text) + Gemini Vision (image analysis) via Emergent Universal Key
- **OCR**: Tesseract OCR for image text extraction
- **Parsers**: PyMuPDF (PDF), python-docx (DOCX), Tesseract + Gemini Vision (Images)
- **Retrieval**: MongoDB text search (BM25-like) with regex fallback

## User Personas
1. **Knowledge Worker** - Uploads documents and asks analytical questions
2. **Researcher** - Compares multiple documents, extracts specific data
3. **Executive** - Wants quick summaries and key insights

## Core Requirements (Static)
- Document upload (PDF, DOCX, Images) with drag-and-drop
- Document processing pipeline: parse → chunk → store
- RAG-based Q&A with citation support
- SSE streaming responses
- Conversation management (create, switch, delete)
- Three-column UI: Documents | Chat | Citations

## What's Been Implemented (v1.0 - June 28, 2026)
- [x] Complete FastAPI backend with all REST API endpoints
- [x] PDF parsing (PyMuPDF), DOCX parsing (python-docx), Image parsing (Tesseract + Gemini Vision)
- [x] Text chunking with sentence boundary awareness
- [x] MongoDB text search retrieval with regex fallback
- [x] SSE streaming chat with source citations
- [x] Conversation history management
- [x] Three-column dark theme UI (Swiss high-contrast design)
- [x] Drag-and-drop upload with progress tracking
- [x] Markdown rendering in chat responses
- [x] Document management (upload, list, search, delete)
- [x] Health check endpoint
- [x] All data-testid attributes for testing

## What's Been Implemented (v2.0 - June 28, 2026)
- [x] Qdrant vector search with HashingVectorizer embeddings (384-dim)
- [x] Hybrid retrieval: Qdrant Dense + MongoDB BM25 + Reciprocal Rank Fusion
- [x] Agent Pipeline: Planner Agent → Retrieval Agent → Memory Agent → Reasoning Agent → Citation Agent
- [x] Planner Agent classifies query intent (summarize/extract/compare/explain/search/general)
- [x] Memory Agent summarizes long conversations (>6 messages)
- [x] Docker Compose configuration (frontend, backend, mongodb services)
- [x] Dockerfiles for frontend (Node.js + nginx) and backend (Python + Tesseract)
- [x] .env.example, Makefile, nginx.conf for production deployment
- [x] Re-indexing of existing chunks into Qdrant on startup
- [x] Qdrant vector upsert during document processing
- [x] Qdrant vector cleanup on document deletion
- [x] Version bumped to 2.0.0

## What's Been Implemented (v2.1 - Document Management System - June 28, 2026)
- [x] Document selection with checkboxes (selected docs participate in retrieval)
- [x] Delete document with confirmation dialog (removes file + Qdrant vectors + MongoDB data)
- [x] Bulk actions: Select All, Clear Selection, Delete Selected
- [x] Context indicator above chat input showing which documents are being searched
- [x] Retrieval filtering by selected document IDs (Qdrant Filter + MongoDB $in + regex fallback)
- [x] New API endpoints: PATCH /documents/select, POST /documents/delete-bulk
- [x] Enhanced document cards: checkbox, icon, filename, type, size, chunks, status, delete
- [x] Empty state: disables chat when no documents uploaded
- [x] Selected border highlighting on document cards
- [x] All tests passing (8/8 backend, 12/12 frontend)

### P0 (Critical)
- All P0 features implemented in v1.0

### P1 (Important)
- Upgrade to proper semantic embeddings (sentence-transformers or Emergent embedding API)
- Cross-encoder reranking for improved retrieval quality
- Multi-provider LLM support (switch between OpenAI/Gemini/Claude at runtime)
- Source highlighting in chat when clicking citations
- DOCX page-level parsing improvement

### P2 (Nice to Have)
- Provider abstraction interfaces (LLM, Embedding, Vision, OCR, Storage)
- Unit tests with mocked AI providers
- S3/GCS storage provider
- Architecture documentation, ADRs, Contributing guide
- Real-time document processing status via WebSocket
- Export conversation as PDF/Markdown

## Next Tasks
1. Upgrade embeddings to sentence-transformers for true semantic search
2. Add cross-encoder reranking
3. Add multi-provider LLM switching
4. Add source click-to-highlight in chat
5. Write comprehensive architecture documentation
