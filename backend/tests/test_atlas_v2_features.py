"""
Backend API tests for Atlas AI v2.0 new features:
- Qdrant hybrid retrieval (sources include retrieval_method)
- Agent pipeline (Planner -> Retrieval -> Memory -> Reasoning)
- 'done' SSE event includes 'plan' field
- Conversation list has accurate message_count
- Docker files exist
"""
import os
import io
import json
import time
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL'):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    return requests.Session()


def _consume_sse(resp, timeout_s=120):
    """Parse SSE stream into list of (event_type, data_dict)."""
    events = []
    buffer = ""
    start = time.time()
    for raw in resp.iter_lines(decode_unicode=True):
        if time.time() - start > timeout_s:
            break
        if raw is None:
            continue
        if raw == "":
            if buffer.strip():
                evt_type, evt_data = None, ""
                for line in buffer.splitlines():
                    if line.startswith("event:"):
                        evt_type = line.split(":", 1)[1].strip()
                    elif line.startswith("data:"):
                        evt_data = line.split(":", 1)[1].strip()
                buffer = ""
                if evt_type:
                    try:
                        parsed = json.loads(evt_data) if evt_data else {}
                    except Exception:
                        parsed = {}
                    events.append((evt_type, parsed))
                    if evt_type in ("done", "error"):
                        break
        else:
            buffer += raw + "\n"
    return events


# ---------- Docker files presence ----------
class TestDockerFiles:
    def test_docker_compose_exists(self):
        p = Path('/app/docker-compose.yml')
        assert p.exists(), "docker-compose.yml missing"
        content = p.read_text()
        # Required services
        assert 'mongodb' in content.lower() or 'mongo' in content.lower()
        assert 'backend' in content.lower()
        assert 'frontend' in content.lower()

    def test_backend_dockerfile_exists(self):
        p = Path('/app/backend/Dockerfile')
        assert p.exists()
        content = p.read_text().lower()
        assert 'python' in content
        assert 'tesseract' in content, "Dockerfile should install tesseract-ocr"

    def test_frontend_dockerfile_exists(self):
        p = Path('/app/frontend/Dockerfile')
        assert p.exists()
        content = p.read_text().lower()
        assert 'node' in content
        assert 'nginx' in content, "Frontend Dockerfile should use nginx for serving"

    def test_env_example_exists(self):
        assert Path('/app/.env.example').exists()

    def test_makefile_exists(self):
        assert Path('/app/Makefile').exists()


# ---------- Health (v2) ----------
class TestHealthV2:
    def test_health_v2(self, session):
        r = session.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "healthy"
        # documents/chunks counts present
        assert isinstance(d["documents_count"], int)
        assert isinstance(d["chunks_count"], int)


# ---------- Agent pipeline / SSE plan field / retrieval_method ----------
class TestAgentPipeline:
    convo_id = None

    def test_chat_returns_plan_in_done(self, session):
        payload = {"question": "Summarize the key topics discussed in the documents."}
        r = session.post(
            f"{API}/chat", json=payload, stream=True, timeout=180,
            headers={"Accept": "text/event-stream"},
        )
        assert r.status_code == 200
        events = _consume_sse(r, timeout_s=170)
        types = [e[0] for e in events]
        assert "sources" in types, f"Missing sources event. Got: {types}"
        assert "token" in types, f"Missing token events. Got: {types}"
        assert "done" in types, f"Missing done event. Got: {types}"
        assert "error" not in types, f"Got error: {events}"

        # Check 'done' event has plan
        done_evt = next(e for e in events if e[0] == "done")
        done_data = done_evt[1]
        assert "plan" in done_data, f"'plan' field missing in done event: {done_data}"
        plan = done_data["plan"]
        assert isinstance(plan, dict)
        assert "intent" in plan, f"plan.intent missing: {plan}"
        assert "search_query" in plan, f"plan.search_query missing: {plan}"
        assert plan["intent"] in [
            "summarize", "extract", "compare", "explain", "search", "general"
        ], f"Unexpected intent: {plan['intent']}"

        TestAgentPipeline.convo_id = done_data.get("conversation_id")

    def test_sources_have_retrieval_method(self, session):
        payload = {"question": "What is artificial intelligence?"}
        r = session.post(
            f"{API}/chat", json=payload, stream=True, timeout=180,
            headers={"Accept": "text/event-stream"},
        )
        assert r.status_code == 200
        events = _consume_sse(r, timeout_s=170)
        sources_evts = [e for e in events if e[0] == "sources"]
        assert sources_evts, "No sources event"
        sources = sources_evts[0][1].get("sources", [])
        # If there are no docs, skip strict check
        if not sources:
            pytest.skip("No sources returned (DB may be empty)")
        for s in sources:
            assert "retrieval_method" in s, f"retrieval_method missing in source: {s}"
            assert s["retrieval_method"] in ("dense", "bm25", "regex", "hybrid"), \
                f"unexpected retrieval_method: {s['retrieval_method']}"


# ---------- Conversation message_count accuracy ----------
class TestConversationMessageCount:
    def test_message_count_reflects_actual_messages(self, session):
        # send 2 chat messages in a new conversation
        payload1 = {"question": "Quick test message 1"}
        r1 = session.post(f"{API}/chat", json=payload1, stream=True, timeout=180)
        assert r1.status_code == 200
        events1 = _consume_sse(r1, timeout_s=170)
        done1 = next((e[1] for e in events1 if e[0] == "done"), None)
        assert done1, f"No done event in first chat. Got events: {[e[0] for e in events1]}"
        conv_id = done1["conversation_id"]
        assert conv_id

        # Second message in same conversation
        payload2 = {"question": "Second test follow up", "conversation_id": conv_id}
        r2 = session.post(f"{API}/chat", json=payload2, stream=True, timeout=180)
        assert r2.status_code == 200
        _consume_sse(r2, timeout_s=170)

        # Fetch conversation list and find ours
        lr = session.get(f"{API}/conversations", timeout=15)
        assert lr.status_code == 200
        convs = lr.json()
        ours = next((c for c in convs if c["id"] == conv_id), None)
        assert ours is not None, "Created conversation not in list"
        # Expect at least 4 (2 user + 2 assistant)
        assert ours["message_count"] >= 4, \
            f"Expected message_count >= 4, got {ours['message_count']}"

        # Cleanup: delete conversation
        session.delete(f"{API}/conversations/{conv_id}", timeout=10)
