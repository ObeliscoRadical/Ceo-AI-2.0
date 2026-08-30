"""Iteration 10 — Voice Mode /api/voice/chat regression tests.

Covers:
- Portuguese audio (synthesized via OpenAI TTS) -> Whisper STT -> CEO reply -> TTS
- Session persistence (create + continue via session_id, GET /api/chat/{sid}/messages)
- Error handling: 401 without cookie, 4xx with empty file, 4xx/5xx with non-audio file
- Regression: /api/ceo-daily and /api/chat/sessions still 200 after modularization
"""
import asyncio
import io
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

# Load env from backend/.env
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "obeliscoradical@gmail.com"
ADMIN_PASSWORD = "CeoAI2026!"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

PT_PHRASE_1 = "Posso contratar mais um técnico este mês?"
PT_PHRASE_2 = "E quanto ao orçamento de marketing?"


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=30)
    assert r.status_code == 200, r.text
    return s


def _synthesize_pt(text: str) -> bytes:
    """Use OpenAI TTS to synthesize a small Portuguese mp3 for use as Whisper input."""
    assert EMERGENT_KEY, "EMERGENT_LLM_KEY missing"
    tts = OpenAITextToSpeech(api_key=EMERGENT_KEY)

    async def _run():
        return await tts.generate_speech(text=text, model="tts-1", voice="onyx", speed=1.0)

    return asyncio.run(_run())


@pytest.fixture(scope="module")
def audio_bytes_1():
    return _synthesize_pt(PT_PHRASE_1)


@pytest.fixture(scope="module")
def audio_bytes_2():
    return _synthesize_pt(PT_PHRASE_2)


@pytest.fixture(scope="module")
def created_session_ids():
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin, created_session_ids):
    yield
    for sid in created_session_ids:
        try:
            admin.delete(f"{BASE_URL}/api/chat/{sid}", timeout=30)
        except Exception:
            pass


# ---------- Voice chat: happy path ----------
class TestVoiceChatHappyPath:

    def test_first_call_returns_full_payload(self, admin, audio_bytes_1, created_session_ids):
        files = {"file": (f"TEST_voice_{uuid.uuid4().hex[:6]}.mp3",
                          io.BytesIO(audio_bytes_1), "audio/mpeg")}
        r = admin.post(f"{BASE_URL}/api/voice/chat", files=files, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        # shape
        for k in ("session_id", "user_text", "reply_text", "audio_base64"):
            assert k in body, f"missing key {k} in {body.keys()}"
        # values
        assert isinstance(body["session_id"], str) and len(body["session_id"]) > 8
        assert isinstance(body["user_text"], str) and body["user_text"].strip()
        assert isinstance(body["reply_text"], str) and body["reply_text"].strip()
        assert isinstance(body["audio_base64"], str)
        assert len(body["audio_base64"]) > 10000, (
            f"audio_base64 too short ({len(body['audio_base64'])} chars); "
            "expected a real TTS payload"
        )
        # user text should be recognizably Portuguese (has letters, not empty tokens)
        assert any(c.isalpha() for c in body["user_text"])
        created_session_ids.append(body["session_id"])
        # stash for next test
        pytest.first_session_id = body["session_id"]
        pytest.first_user_text = body["user_text"]
        pytest.first_reply_text = body["reply_text"]

    def test_second_call_continues_same_session(self, admin, audio_bytes_2, created_session_ids):
        sid = getattr(pytest, "first_session_id", None)
        assert sid, "first call must have created a session"
        files = {"file": ("TEST_voice_2.mp3", io.BytesIO(audio_bytes_2), "audio/mpeg")}
        r = admin.post(f"{BASE_URL}/api/voice/chat",
                       files=files, data={"session_id": sid}, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        # SAME session_id echoed back
        assert body["session_id"] == sid, f"expected same sid {sid}, got {body['session_id']}"
        assert body["user_text"].strip()
        assert body["reply_text"].strip()
        assert len(body["audio_base64"]) > 10000

    def test_chat_messages_endpoint_shows_conversation(self, admin, created_session_ids):
        sid = getattr(pytest, "first_session_id", None)
        assert sid
        r = admin.get(f"{BASE_URL}/api/chat/{sid}/messages", timeout=30)
        assert r.status_code == 200, r.text
        msgs = r.json()
        assert isinstance(msgs, list)
        # 2 voice calls -> 2 user + 2 assistant = 4 messages minimum
        assert len(msgs) >= 4, f"expected >=4 messages, got {len(msgs)}: {msgs}"
        roles = [m.get("role") for m in msgs]
        assert roles.count("user") >= 2
        assert roles.count("assistant") >= 2
        # first user text must match the initial voice transcription
        first_user = next(m for m in msgs if m.get("role") == "user")
        assert first_user["content"].strip() == getattr(pytest, "first_user_text", "").strip()

    def test_new_session_when_no_session_id(self, admin, audio_bytes_1, created_session_ids):
        # Calling voice/chat again WITHOUT session_id should create a fresh session
        files = {"file": ("TEST_voice_new.mp3", io.BytesIO(audio_bytes_1), "audio/mpeg")}
        r = admin.post(f"{BASE_URL}/api/voice/chat", files=files, timeout=90)
        assert r.status_code == 200, r.text
        new_sid = r.json()["session_id"]
        old_sid = getattr(pytest, "first_session_id", None)
        assert new_sid != old_sid, "expected a new session_id for a call without session_id"
        created_session_ids.append(new_sid)


# ---------- Voice chat: error handling ----------
class TestVoiceChatErrors:

    def test_unauthenticated_returns_401(self, audio_bytes_1):
        # fresh session with no auth cookie
        anon = requests.Session()
        files = {"file": ("TEST_voice.mp3", io.BytesIO(audio_bytes_1), "audio/mpeg")}
        r = anon.post(f"{BASE_URL}/api/voice/chat", files=files, timeout=30)
        assert r.status_code == 401, f"expected 401 without cookie, got {r.status_code}: {r.text[:200]}"

    def test_empty_file_returns_4xx(self, admin):
        files = {"file": ("empty.mp3", io.BytesIO(b""), "audio/mpeg")}
        r = admin.post(f"{BASE_URL}/api/voice/chat", files=files, timeout=30)
        # Backend raises 400 for empty audio; must be a client error, not a crash
        assert 400 <= r.status_code < 500, f"expected 4xx for empty file, got {r.status_code}"

    def test_non_audio_file_returns_error_no_crash(self, admin):
        # Send text bytes with an mp3 extension — Whisper should reject / STT should fail cleanly
        files = {"file": ("not_audio.mp3", io.BytesIO(b"this is not audio, just plain text"),
                          "audio/mpeg")}
        r = admin.post(f"{BASE_URL}/api/voice/chat", files=files, timeout=60)
        # Must not crash into an empty/gateway-error; must be a well-formed 4xx or 500 JSON
        assert r.status_code >= 400, f"expected error status, got {r.status_code}"
        assert r.status_code < 600
        # response body should be JSON (FastAPI HTTPException)
        try:
            body = r.json()
            assert "detail" in body or "message" in body
        except ValueError:
            pytest.fail(f"non-JSON error response: {r.text[:200]}")


# ---------- Regression: other core routes still work ----------
class TestRegressionOtherRoutes:

    def test_ceo_daily_200(self, admin):
        r = admin.get(f"{BASE_URL}/api/ceo-daily", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("conclusao", "recomendacoes", "vitals"):
            assert k in d

    def test_chat_sessions_200(self, admin):
        r = admin.get(f"{BASE_URL}/api/chat/sessions", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_investment_grade_200(self, admin):
        r = admin.get(f"{BASE_URL}/api/investment-grade", timeout=120)
        assert r.status_code == 200

    def test_login_200(self):
        # fresh login (independent from module fixture)
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
