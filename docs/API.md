# API Documentation

**Base URL**: `/api`

All endpoints are prefixed with `/api`. No authentication is required.

---

## Health

### `GET /api/health`

Check service status.

**Response** `200`

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "documents_count": 5,
  "chunks_count": 39
}
```

---

## Documents

### `POST /api/upload`

Upload a document for processing.

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file | Yes | PDF, DOCX, DOC, PNG, JPG, JPEG, WEBP, GIF, or BMP |

**Response** `200`

```json
{
  "id": "7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba",
  "filename": "report.pdf",
  "file_type": "pdf",
  "file_size": 55642,
  "status": "processing",
  "chunks_count": 0,
  "selected": true,
  "error_message": null,
  "created_at": "2026-06-28T10:52:49.933218+00:00",
  "updated_at": "2026-06-28T10:52:49.933218+00:00"
}
```

Processing runs in a background task. Poll `GET /api/documents` until `status` changes to `"ready"` or `"error"`.

**Pipeline**: Save to disk → parse (PyMuPDF / python-docx / Tesseract + Gemini Vision) → chunk (800 char, 150 overlap) → store chunks in MongoDB (text index) → embed via HashingVectorizer → upsert 384-dim vectors into Qdrant.

**Error** `400`

```json
{
  "detail": "Unsupported file type: exe. Allowed: pdf, docx, doc, png, jpg, jpeg, webp, gif, bmp"
}
```

---

### `GET /api/documents`

List all uploaded documents, newest first.

**Response** `200`

```json
[
  {
    "id": "7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba",
    "filename": "report.pdf",
    "file_type": "pdf",
    "file_size": 55642,
    "status": "ready",
    "chunks_count": 15,
    "selected": true,
    "error_message": null,
    "created_at": "2026-06-28T10:52:49.933218+00:00",
    "updated_at": "2026-06-28T10:52:49.943948+00:00"
  }
]
```

The `selected` field indicates whether this document participates in retrieval.

---

### `DELETE /api/documents/{id}`

Delete a single document, its chunks, Qdrant vectors, and uploaded file.

**Response** `200`

```json
{
  "status": "deleted",
  "id": "7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba"
}
```

**Error** `404`

```json
{
  "detail": "Document not found"
}
```

---

### `POST /api/documents/delete-bulk`

Delete multiple documents in one request.

**Request body**

```json
{
  "document_ids": [
    "7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  ]
}
```

**Response** `200`

```json
{
  "status": "deleted",
  "deleted_ids": ["7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba"],
  "count": 1
}
```

IDs that don't exist are silently skipped. `count` reflects the number actually deleted.

---

### `PATCH /api/documents/select`

Toggle the selection state for one or more documents. Selected documents participate in chat retrieval; unselected documents are excluded.

**Request body**

```json
{
  "document_ids": ["7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba"],
  "selected": false
}
```

**Response** `200`

```json
{
  "status": "updated",
  "modified_count": 1
}
```

---

## Chat

### `POST /api/chat`

Send a question and receive a streaming response via Server-Sent Events (SSE).

**Request body**

```json
{
  "question": "What skills are mentioned in the document?",
  "conversation_id": "optional-uuid-to-continue-conversation",
  "selected_document_ids": ["uuid1", "uuid2"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The user's question |
| `conversation_id` | string | No | Continue an existing conversation. Omit to create new. |
| `selected_document_ids` | string[] | No | Only retrieve from these documents. `null` or `[]` = search all. |

**Response**: `text/event-stream`

The response is a stream of Server-Sent Events. Three event types are emitted in order:

#### 1. `sources` (emitted once, first)

Contains the retrieved document chunks and the conversation ID.

```
event: sources
data: {"sources": [...], "conversation_id": "uuid"}
```

Each source object:

```json
{
  "index": 1,
  "id": "chunk-uuid",
  "text": "First 300 characters of the chunk...",
  "full_text": "Complete chunk text...",
  "filename": "report.pdf",
  "page": 3,
  "file_type": "pdf",
  "score": 0.3189,
  "retrieval_method": "dense"
}
```

`retrieval_method` is one of: `"dense"` (Qdrant), `"bm25"` (MongoDB text search), `"regex"` (fallback), or present on RRF-fused results.

#### 2. `token` (emitted many times)

Each token from the LLM response as it's generated.

```
event: token
data: {"content": "The"}

event: token
data: {"content": " document"}

event: token
data: {"content": " mentions"}
```

#### 3. `done` (emitted once, last)

Signals completion. Includes the planner agent's classification.

```
event: done
data: {
  "conversation_id": "uuid",
  "message_id": "uuid",
  "plan": {
    "intent": "summarize",
    "search_query": "document summary",
    "entities": ["documents"]
  }
}
```

`plan.intent` values: `"summarize"`, `"compare"`, `"extract"`, `"explain"`, `"search"`, `"general"`.

#### Error event

Emitted if the pipeline fails. Replaces the `done` event.

```
event: error
data: {"message": "Budget has been exceeded"}
```

### Internal pipeline

When `/api/chat` is called, this happens:

1. Get or create conversation in MongoDB
2. Save the user message
3. **Invoke the compiled LangGraph** (`atlas_graph.ainvoke()`) which runs:
   - PlannerAgent → classify intent, extract search query
   - DocumentAgent → resolve document filter
   - VisionAgent → flag visual queries
   - RetrievalAgent → hybrid search (Qdrant + BM25 + RRF)
   - MemoryAgent → summarise conversation if > 6 messages
   - ReasoningAgent → build system prompt
   - CitationAgent → structure citation metadata
4. Send `sources` SSE event
5. Stream LLM response (GPT-5.4) token-by-token as `token` SSE events
6. Save assistant message with citations
7. Send `done` SSE event

### Example with curl

```bash
curl -N -X POST http://localhost:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Summarize this document",
    "selected_document_ids": ["7af5dbc0-35dc-450a-b7ba-d5bf2d3edeba"]
  }'
```

---

## Conversations

### `GET /api/conversations`

List all conversations, newest first.

**Response** `200`

```json
[
  {
    "id": "c3cc28eb-e64b-40a7-a077-3d3da998fae9",
    "title": "What skills are mentioned in the document?",
    "message_count": 4,
    "created_at": "2026-06-28T11:35:42.000000+00:00",
    "updated_at": "2026-06-28T11:40:12.000000+00:00"
  }
]
```

---

### `GET /api/conversations/{id}`

Get a conversation with all messages.

**Response** `200`

```json
{
  "id": "c3cc28eb-e64b-40a7-a077-3d3da998fae9",
  "title": "What skills are mentioned in the document?",
  "messages": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "What skills are mentioned in the document?",
      "sources": [],
      "created_at": "2026-06-28T11:35:42.000000+00:00"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "The document mentions the following skills:\n\n1. **Python** [Source 1]...",
      "sources": [
        {"index": 1, "filename": "report.pdf", "page": 1, "file_type": "pdf"}
      ],
      "created_at": "2026-06-28T11:35:48.000000+00:00"
    }
  ],
  "created_at": "2026-06-28T11:35:42.000000+00:00",
  "updated_at": "2026-06-28T11:35:48.000000+00:00"
}
```

**Error** `404`

```json
{
  "detail": "Conversation not found"
}
```

---

### `DELETE /api/conversations/{id}`

Delete a conversation and all its messages.

**Response** `200`

```json
{
  "status": "deleted",
  "id": "c3cc28eb-e64b-40a7-a077-3d3da998fae9"
}
```

---

## Error responses

All error responses use standard HTTP status codes with a JSON body:

| Status | Meaning |
|---|---|
| `400` | Bad request (invalid file type, missing fields) |
| `404` | Resource not found |
| `422` | Validation error (Pydantic) |
| `500` | Internal server error |

```json
{
  "detail": "Human-readable error message"
}
```

For Pydantic validation errors (422):

```json
{
  "detail": [
    {
      "loc": ["body", "question"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## CORS

The backend allows all origins by default (`CORS_ORIGINS=*`). In production, restrict to your frontend domain.

---

## Rate limits

No rate limiting is enforced at the application level. The Emergent LLM key has its own budget limits. If the budget is exceeded, the chat endpoint returns an `error` SSE event with the message.
