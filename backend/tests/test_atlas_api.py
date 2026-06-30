"""
Backend API tests for Atlas AI - Multimodal Agentic RAG Platform
Covers: health, upload, documents CRUD, chat SSE, conversations
"""
import os
import io
import json
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://agentic-retrieval.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Try reading frontend/.env as a fallback
if 'REACT_APP_BACKEND_URL' not in os.environ:
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL'):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    API = f"{BASE_URL}/api"
    except Exception:
        pass


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


def _create_minimal_pdf_bytes() -> bytes:
    """Build a tiny valid PDF using PyMuPDF."""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        "Atlas AI Test Document. The quick brown fox jumps over the lazy dog. "
        "Enterprise multimodal retrieval augmented generation platform. "
        "This document discusses artificial intelligence and machine learning."
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# ---------- Health ----------
class TestHealth:
    def test_health_endpoint(self, session):
        r = session.get(f"{API}/health", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "healthy"
        assert data["version"] == "2.0.0"
        assert isinstance(data["documents_count"], int)
        assert isinstance(data["chunks_count"], int)


# ---------- Documents ----------
class TestDocuments:
    uploaded_doc_id = None

    def test_list_documents(self, session):
        r = session.get(f"{API}/documents", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_upload_pdf_and_processing(self, session):
        pdf_bytes = _create_minimal_pdf_bytes()
        files = {'file': ('TEST_atlas.pdf', io.BytesIO(pdf_bytes), 'application/pdf')}
        r = session.post(f"{API}/upload", files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["filename"] == "TEST_atlas.pdf"
        assert data["file_type"] == "pdf"
        assert data["status"] == "processing"
        assert "id" in data
        TestDocuments.uploaded_doc_id = data["id"]

        # Poll for status -> 'ready'
        ready = False
        for _ in range(20):
            time.sleep(2)
            lr = session.get(f"{API}/documents", timeout=10)
            assert lr.status_code == 200
            for d in lr.json():
                if d["id"] == TestDocuments.uploaded_doc_id:
                    if d["status"] == "ready":
                        ready = True
                        assert d["chunks_count"] >= 1
                        break
                    if d["status"] == "error":
                        pytest.fail(f"Document processing errored: {d.get('error_message')}")
            if ready:
                break
        assert ready, "Document did not reach 'ready' status in 40s"

    def test_upload_unsupported_extension(self, session):
        files = {'file': ('bad.xyz', io.BytesIO(b"hello"), 'application/octet-stream')}
        r = session.post(f"{API}/upload", files=files, timeout=15)
        assert r.status_code == 400

    def test_delete_document(self, session):
        # Upload a doc just to delete
        pdf_bytes = _create_minimal_pdf_bytes()
        files = {'file': ('TEST_to_delete.pdf', io.BytesIO(pdf_bytes), 'application/pdf')}
        r = session.post(f"{API}/upload", files=files, timeout=30)
        assert r.status_code == 200
        doc_id = r.json()["id"]

        # delete
        dr = session.delete(f"{API}/documents/{doc_id}", timeout=15)
        assert dr.status_code == 200
        assert dr.json().get("status") == "deleted"

        # ensure not in list
        lr = session.get(f"{API}/documents", timeout=10)
        assert all(d["id"] != doc_id for d in lr.json())

    def test_delete_nonexistent(self, session):
        r = session.delete(f"{API}/documents/non-existent-id-xyz", timeout=10)
        assert r.status_code == 404


# ---------- Chat SSE ----------
class TestChat:
    conversation_id = None

    def test_chat_sse_stream(self, session):
        payload = {"question": "What does the test document discuss?"}
        r = session.post(
            f"{API}/chat",
            json=payload,
            stream=True,
            timeout=120,
            headers={"Accept": "text/event-stream"},
        )
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")

        events_seen = {"sources": False, "token": False, "done": False, "error": False}
        token_text = ""
        sources_data = None
        conv_id = None

        # Read SSE events line by line
        buffer = ""
        start = time.time()
        for raw in r.iter_lines(decode_unicode=True):
            if raw is None:
                continue
            if raw == "":
                # End of an event
                if not buffer.strip():
                    continue
                evt_type, evt_data = None, None
                for line in buffer.splitlines():
                    if line.startswith("event:"):
                        evt_type = line.split(":", 1)[1].strip()
                    elif line.startswith("data:"):
                        evt_data = line.split(":", 1)[1].strip()
                buffer = ""
                if evt_type:
                    events_seen[evt_type] = True
                    try:
                        parsed = json.loads(evt_data) if evt_data else {}
                    except Exception:
                        parsed = {}
                    if evt_type == "sources":
                        sources_data = parsed.get("sources", [])
                        conv_id = parsed.get("conversation_id")
                    elif evt_type == "token":
                        token_text += parsed.get("content", "")
                    elif evt_type == "done":
                        TestChat.conversation_id = parsed.get("conversation_id") or conv_id
                        break
                    elif evt_type == "error":
                        pytest.fail(f"Chat stream error: {parsed}")
            else:
                buffer += raw + "\n"

            if time.time() - start > 110:
                pytest.fail("Chat stream timed out")

        assert events_seen["sources"], "sources event not received"
        assert events_seen["token"], "no token events received"
        assert events_seen["done"], "done event not received"
        assert len(token_text) > 0
        assert isinstance(sources_data, list)
        assert TestChat.conversation_id is not None

    def test_list_conversations(self, session):
        r = session.get(f"{API}/conversations", timeout=10)
        assert r.status_code == 200
        convs = r.json()
        assert isinstance(convs, list)
        if TestChat.conversation_id:
            assert any(c["id"] == TestChat.conversation_id for c in convs)

    def test_get_conversation(self, session):
        if not TestChat.conversation_id:
            pytest.skip("No conversation_id from prior test")
        r = session.get(f"{API}/conversations/{TestChat.conversation_id}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == TestChat.conversation_id
        assert isinstance(data["messages"], list)
        # should have user + assistant message
        roles = [m["role"] for m in data["messages"]]
        assert "user" in roles
        assert "assistant" in roles

    def test_get_conversation_not_found(self, session):
        r = session.get(f"{API}/conversations/nope-not-real", timeout=10)
        assert r.status_code == 404
