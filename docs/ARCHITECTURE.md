# Architecture Documentation

## System overview

Atlas AI is a three-tier application: a React single-page app communicates with a FastAPI backend over REST and SSE, while the backend stores metadata in MongoDB, stores vector embeddings in Qdrant (in-memory), and calls external LLM services via the Emergent universal key.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client (Browser)                          │
│                                                                     │
│  ┌──────────────┐  ┌────────────────────┐  ┌───────────────────┐   │
│  │ DocumentPanel │  │     ChatPanel      │  │  CitationsPanel   │   │
│  │              │  │                    │  │                   │   │
│  │ • Upload zone│  │ • Message list     │  │ • Source cards    │   │
│  │ • Checkboxes │  │ • SSE consumer     │  │ • Retrieval tags  │   │
│  │ • Bulk ops   │  │ • Markdown render  │  │ • Page / score    │   │
│  │ • Search     │  │ • Context indicator│  │                   │   │
│  └──────┬───────┘  └────────┬───────────┘  └───────────────────┘   │
│         │                   │                                       │
└─────────┼───────────────────┼───────────────────────────────────────┘
          │ REST              │ POST /api/chat (SSE)
          │                   │
┌─────────▼───────────────────▼───────────────────────────────────────┐
│                        FastAPI Backend (port 8001)                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Compiled LangGraph (atlas_graph)             │  │
│  │                                                               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │ Planner  │→ │ Document │→ │  Vision  │→ │  Retrieval  │  │  │
│  │  │  Agent   │  │  Agent   │  │  Agent   │  │   Agent     │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────┬──────┘  │  │
│  │                                                    ▼         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐    │  │
│  │  │ Citation │← │Reasoning │← │       Memory Agent      │    │  │
│  │  │  Agent   │  │  Agent   │  │                         │    │  │
│  │  └──────────┘  └──────────┘  └─────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ Document Parsers │  │ Embedding Svc   │  │ LLM Streaming    │   │
│  │ • PyMuPDF (PDF)  │  │ • Hashing       │  │ • Emergent SDK   │   │
│  │ • python-docx    │  │   Vectorizer    │  │ • GPT-5.4        │   │
│  │ • Tesseract OCR  │  │ • 384-dim       │  │ • Gemini Vision  │   │
│  │ • Gemini Vision  │  │                 │  │ • SSE generator  │   │
│  └────────┬────────┘  └────────┬────────┘  └──────────────────┘   │
│           │                    │                                    │
└───────────┼────────────────────┼────────────────────────────────────┘
            │                    │
   ┌────────▼────────┐  ┌───────▼────────┐
   │    MongoDB      │  │    Qdrant      │
   │                 │  │  (in-memory)   │
   │ • documents     │  │               │
   │ • chunks (text  │  │ • 384-dim     │
   │   index)        │  │   cosine      │
   │ • conversations │  │ • filter by   │
   │                 │  │   document_id │
   └─────────────────┘  └───────────────┘
```

---

## LangGraph: the compiled StateGraph

The agent pipeline is defined as a LangGraph `StateGraph`, compiled once at module load (`atlas_graph = _graph_builder.compile()`), and invoked per chat request via `await atlas_graph.ainvoke(initial_state)`.

### Graph definition

```python
_graph_builder = StateGraph(AgentState)

_graph_builder.add_node("planner_agent",   planner_node)
_graph_builder.add_node("document_agent",  document_node)
_graph_builder.add_node("vision_agent",    vision_node)
_graph_builder.add_node("retrieval_agent", retrieval_node)
_graph_builder.add_node("memory_agent",    memory_node)
_graph_builder.add_node("reasoning_agent", reasoning_node)
_graph_builder.add_node("citation_agent",  citation_node)

_graph_builder.add_edge(START, "planner_agent")
_graph_builder.add_edge("planner_agent",   "document_agent")
_graph_builder.add_edge("document_agent",  "vision_agent")
_graph_builder.add_edge("vision_agent",    "retrieval_agent")
_graph_builder.add_edge("retrieval_agent", "memory_agent")
_graph_builder.add_edge("memory_agent",    "reasoning_agent")
_graph_builder.add_edge("reasoning_agent", "citation_agent")
_graph_builder.add_edge("citation_agent",  END)

atlas_graph = _graph_builder.compile()
```

### Edge diagram

```
START
  │
  ▼
planner_agent ──→ document_agent ──→ vision_agent ──→ retrieval_agent
                                                           │
                                                           ▼
                citation_agent ◄── reasoning_agent ◄── memory_agent
                     │
                     ▼
                    END
```

### Node responsibilities

| Node | Input from state | Writes to state | What it does |
|---|---|---|---|
| **PlannerAgent** | `user_query` | `plan` | LLM call to classify intent (`summarize`, `compare`, `extract`, `explain`, `search`, `general`) and extract an optimised search query |
| **DocumentAgent** | `selected_document_ids` | `document_ids` | Resolves document filter — empty selection means search all |
| **VisionAgent** | `user_query` | `needs_vision` | Keyword check for visual terms; adds a system-prompt hint |
| **RetrievalAgent** | `user_query`, `plan`, `document_ids` | `retrieved_chunks`, `sources` | Runs hybrid retrieval (Qdrant dense + MongoDB BM25 + RRF), builds frontend source payloads |
| **MemoryAgent** | `conversation_messages` | `conversation_summary` | If > 6 messages: LLM-summarise older ones, keep recent 4 intact |
| **ReasoningAgent** | `retrieved_chunks`, `plan`, `conversation_summary`, `needs_vision` | `reasoning_context` | Assembles the full system prompt (does NOT call LLM — streaming happens outside the graph) |
| **CitationAgent** | `sources` | `citations` | Structures citation metadata for persistence |

### AgentState schema

```python
class AgentState(TypedDict, total=False):
    # Input
    user_query: str
    conversation_id: str
    selected_document_ids: list
    conversation_messages: list
    # Intermediate
    plan: dict               # {"intent": str, "search_query": str, "entities": list}
    document_ids: list | None
    needs_vision: bool
    retrieved_chunks: list   # Raw chunk dicts from hybrid_retrieval
    sources: list            # Frontend-ready source payloads
    conversation_summary: str
    reasoning_context: str   # The assembled system prompt
    # Output
    citations: list          # Structured citation metadata
    final_response: str      # Populated after streaming (outside graph)
```

### Why streaming happens outside the graph

LangGraph's `ainvoke()` runs all nodes to completion and returns the final state. The actual LLM token streaming uses the Emergent SDK (`LlmChat.stream_message()`), which yields `TextDelta` events that must flow to the client as SSE in real time. Running this inside a LangGraph node would buffer the entire response before returning, breaking the streaming UX. The graph prepares everything (context, prompt, citations); the endpoint streams.

---

## Document processing pipeline

```
                           ┌─────────────┐
                           │  POST       │
                           │  /api/upload│
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │ Save to disk │
                           │ uploads/{id}/│
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │ Background  │
                           │   Task      │
                           └──────┬──────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
             ┌───────────┐ ┌──────────┐  ┌────────────┐
             │ parse_pdf  │ │parse_docx│  │parse_image │
             │ (PyMuPDF)  │ │(python-  │  │(Tesseract  │
             │            │ │ docx)    │  │+ Gemini    │
             └─────┬─────┘ └────┬─────┘  │ Vision)    │
                   │            │         └─────┬──────┘
                   └────────────┼───────────────┘
                                ▼
                     ┌─────────────────────┐
                     │ chunk_text()        │
                     │ 800 char window     │
                     │ 150 char overlap    │
                     │ Sentence boundaries │
                     └──────────┬──────────┘
                                │
                    ┌───────────┼──────────┐
                    ▼                      ▼
          ┌──────────────────┐  ┌──────────────────┐
          │ MongoDB insert   │  │ Qdrant upsert    │
          │ (chunks coll.,   │  │ (384-dim vectors,│
          │  text index)     │  │  cosine distance)│
          └──────────────────┘  └──────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │ Document status  │
          │  → "ready"       │
          └──────────────────┘
```

---

## Hybrid retrieval pipeline

```
User query
    │
    ├──→ HashingVectorizer → 384-dim query vector
    │         │
    │         ▼
    │    ┌──────────────────────┐
    │    │   Qdrant Dense       │
    │    │   query_points()     │ ──→ Top-K results (scored by cosine)
    │    │   [filter: doc_ids]  │
    │    └──────────────────────┘
    │
    ├──→ MongoDB $text search
    │    ┌──────────────────────┐
    │    │   BM25 text search   │
    │    │   db.chunks.find()   │ ──→ Top-K results (scored by textScore)
    │    │   [filter: doc_ids]  │
    │    └──────────────────────┘
    │
    │         ┌───────────────────────────────────┐
    └────────→│   Reciprocal Rank Fusion (RRF)    │
              │                                   │
              │   score(d) = Σ 1/(k + rank_i + 1) │
              │   k = 60                          │
              │                                   │
              │   Merge dense + BM25 rankings     │
              │   Sort by fused score             │
              └──────────────┬────────────────────┘
                             │
                             ▼
                    Top-K fused results
                    (with retrieval_method tag)
```

**Fallback**: if both Qdrant and MongoDB return zero results, a regex keyword search runs as a safety net.

**Document filtering**: when the user selects specific documents, a Qdrant `Filter(must=[FieldCondition(key="document_id", match=MatchAny(any=ids))])` and a MongoDB `{"document_id": {"$in": ids}}` constraint are applied to every search leg.

---

## SSE streaming protocol

The `POST /api/chat` endpoint returns `text/event-stream`. Three event types:

```
event: sources
data: {"sources": [...], "conversation_id": "uuid"}

event: token
data: {"content": "The"}

event: token
data: {"content": " document"}

  ... (hundreds of token events) ...

event: done
data: {"conversation_id": "uuid", "message_id": "uuid", "plan": {...}}
```

On error:

```
event: error
data: {"message": "Budget has been exceeded"}
```

The frontend reads this stream via `fetch()` + `ReadableStream`, parsing events from a line buffer.

---

## Database schema

### MongoDB collections

**documents**

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Primary key, unique index |
| `filename` | string | Original filename |
| `file_type` | string | `pdf`, `docx`, `png`, etc. |
| `file_size` | int | Bytes |
| `file_path` | string | Disk path (excluded from API responses) |
| `status` | string | `processing` / `ready` / `error` |
| `chunks_count` | int | Number of chunks created |
| `selected` | bool | Whether document participates in retrieval |
| `error_message` | string / null | Error details if processing failed |
| `created_at` | string (ISO) | |
| `updated_at` | string (ISO) | |

**chunks**

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `document_id` | string (UUID) | FK to documents |
| `text` | string | Chunk content. Has a MongoDB text index |
| `metadata.filename` | string | |
| `metadata.page` | int | Page number (1-based) |
| `metadata.chunk_index` | int | Position within the page |
| `metadata.file_type` | string | |
| `created_at` | string (ISO) | |

**conversations**

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Primary key, unique index |
| `title` | string | Auto-generated from first question |
| `messages` | array | Embedded message subdocuments |
| `messages[].id` | string (UUID) | |
| `messages[].role` | string | `user` / `assistant` |
| `messages[].content` | string | Message text |
| `messages[].sources` | array | Citation metadata (assistant only) |
| `messages[].created_at` | string (ISO) | |
| `created_at` | string (ISO) | |
| `updated_at` | string (ISO) | |

### Qdrant collection — `atlas_chunks`

| Property | Value |
|---|---|
| Vector size | 384 |
| Distance metric | Cosine |
| Point ID | Chunk UUID (string) |
| Payload fields | `document_id`, `text`, `metadata` |

Qdrant runs in-memory. On every backend startup, all MongoDB chunks are re-indexed into Qdrant to ensure consistency.

---

## Design decisions

### ADR-001: LangGraph over raw async

**Decision**: Use LangGraph `StateGraph` for agent orchestration.

**Context**: The original implementation was a sequence of `await` calls. This works but makes the pipeline opaque — there is no inspectable graph, no typed state, and adding conditional branches requires manual `if/else` chains.

**Consequences**: The pipeline is now a compiled graph with named nodes and typed state. Future work (conditional vision routing, parallel retrieval, human-in-the-loop) requires only graph edits, not endpoint rewrites. The LLM streaming call remains outside the graph to preserve real-time SSE.

### ADR-002: Qdrant in-memory + startup re-indexing

**Decision**: Run Qdrant with `QdrantClient(":memory:")` and re-index from MongoDB on every startup.

**Context**: A persistent Qdrant service would require another Docker container and disk management. For the current scale (thousands of chunks), in-memory is fast and correct. Re-indexing from MongoDB makes MongoDB the source of truth.

**Trade-off**: Data is re-embedded on every restart. Acceptable for development and moderate production loads.

### ADR-003: HashingVectorizer over sentence-transformers

**Decision**: Use scikit-learn `HashingVectorizer(n_features=384)` for embeddings.

**Context**: True semantic embeddings (e.g., `all-MiniLM-L6-v2`) require a 80+ MB model download and PyTorch. The HashingVectorizer is stateless, produces consistent 384-dim vectors, and needs no downloads.

**Trade-off**: Recall is keyword-based, not semantic. Paraphrased queries will miss relevant chunks. The BM25 leg and RRF fusion compensate partially. Upgrading to sentence-transformers is the highest-priority improvement.

### ADR-004: Streaming outside the graph

**Decision**: The ReasoningAgent node builds the system prompt. The actual `LlmChat.stream_message()` call runs in the SSE generator after `atlas_graph.ainvoke()` returns.

**Context**: LangGraph's `ainvoke()` runs all nodes to completion. Putting the streaming LLM call inside a node would buffer the full response before the graph returns, defeating real-time SSE.

**Consequence**: The frontend receives tokens immediately. The `final_response` field in `AgentState` is populated after streaming, outside the graph.

---

## Future roadmap

1. **Semantic embeddings** — Replace HashingVectorizer with sentence-transformers or an Emergent embedding API
2. **Conditional graph edges** — Route VisionAgent to a dedicated image-analysis node when `needs_vision=True`
3. **Cross-encoder reranking** — Add a reranking step between retrieval and reasoning
4. **Module split** — Extract `graph.py`, `nodes.py`, `retrieval.py`, `parsers.py` from the 1100-line `server.py`
5. **LangGraph streaming events** — Use `astream_events()` for observability and per-node timing
6. **Persistent Qdrant** — Move to a Docker service with disk persistence for production
