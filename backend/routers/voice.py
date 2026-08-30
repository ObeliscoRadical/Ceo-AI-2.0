from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from core import *
from models import *
import io, tempfile, os as _os, base64, httpx
from gtts import gTTS

router = APIRouter()

FISH_AUDIO_API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "sk-fish-AWsZ4SMNS0H0BjAtcVN5gTpWnqcHN6vDPbOkzQ_As6Y")
FISH_AUDIO_VOICE_ID = os.environ.get("FISH_AUDIO_VOICE_ID", "ec426c7ea3554caba8a5b077a4c701aa")

VOICE_HINT = ("(Estás numa conversa por VOZ. Responde de forma falada, natural, calorosa e concisa — "
              "como se estivesses a falar ao telefone com o empresário. Evita listas e formatação; frases curtas. "
              "Máximo 4-6 frases.)")

async def synthesize_voice(text: str) -> str:
    """Sintetiza áudio usando a voz Jarbas (Fish Audio) com fallback para gTTS."""
    clean_text = text.strip()
    if not clean_text:
        return ""

    # 1. Fish Audio (Jarbas Voice)
    if FISH_AUDIO_API_KEY and FISH_AUDIO_VOICE_ID:
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(
                    "https://api.fish.audio/v1/tts",
                    headers={
                        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
                        "Content-Type": "application/json",
                        "model": "s2.1-pro-free",
                    },
                    json={
                        "text": clean_text[:1200],
                        "reference_id": FISH_AUDIO_VOICE_ID,
                        "format": "mp3",
                    },
                )
                if res.status_code == 200 and res.content:
                    logger.info("Generated voice with Fish Audio (Jarbas - Free Tier) successfully.")
                    return base64.b64encode(res.content).decode("utf-8")
                else:
                    logger.warning(f"Fish Audio response {res.status_code}: {res.text[:200]}")
        except Exception as e:
            logger.warning(f"Fish Audio error: {e}")

    # 2. Fallback gTTS
    try:
        def _gtts_call():
            fp = io.BytesIO()
            tts = gTTS(text=clean_text[:600], lang="pt", tld="pt")
            tts.write_to_fp(fp)
            fp.seek(0)
            return base64.b64encode(fp.read()).decode("utf-8")
        return await asyncio.to_thread(_gtts_call)
    except Exception as e:
        logger.error(f"Fallback gTTS error: {e}")
        return ""

class TTSInput(BaseModel):
    text: str

@router.post("/voice/tts")
async def text_to_speech(inp: TTSInput, user: dict = Depends(get_current_user)):
    audio_b64 = await synthesize_voice(inp.text)
    if not audio_b64:
        raise HTTPException(500, "Não foi possível gerar áudio")
    return {"audio_base64": audio_b64}

@router.post("/voice/chat")
async def voice_chat(file: UploadFile = File(...), session_id: str = Form(None), user: dict = Depends(get_current_user)):
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Áudio vazio")
    
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "webm").lower()
    mime_map = {"webm": "audio/webm", "mp3": "audio/mp3", "wav": "audio/wav", "m4a": "audio/mp4", "ogg": "audio/ogg"}
    mime = mime_map.get(ext, file.content_type or "audio/webm")

    try:
        audio_part = types.Part.from_bytes(data=audio, mime_type=mime)
        user_text = await ai_text(
            "És um transcritor profissional de áudio em português. Transcreve com exatidão o áudio fornecido. Devolve APENAS o texto transcrito sem comentários.",
            [audio_part, "Transcreve este áudio em português."],
            model=DEFAULT_LLM_MODEL
        )
        user_text = (user_text or "").strip()
    except Exception as e:
        logger.error(f"gemini stt error: {e}")
        raise HTTPException(500, "Não consegui perceber o áudio")

    if not user_text:
        raise HTTPException(422, "Não percebi nada. Tenta falar outra vez.")

    sid = session_id
    if not sid:
        sid = str(uuid.uuid4())
        await db.chat_sessions.insert_one({"session_id": sid, "user_id": user["id"],
            "title": user_text[:50], "created_at": datetime.now(timezone.utc).isoformat()})
    history = await db.chat_messages.find({"session_id": sid, "user_id": user["id"]}).sort("created_at", 1).to_list(1000)
    await db.chat_messages.insert_one({"session_id": sid, "user_id": user["id"], "role": "user",
        "content": user_text, "created_at": datetime.now(timezone.utc).isoformat()})

    chat_obj = await get_chat(user["id"], user.get("name", ""), sid)
    context = f"{VOICE_HINT}\n\n{user_text}"
    if history:
        hist_txt = "\n".join(f"{h['role']}: {h['content']}" for h in history[-8:])
        context = f"{VOICE_HINT}\n\n[Histórico]\n{hist_txt}\n\n[Nova mensagem falada]\n{user_text}"
    try:
        reply = await chat_obj.send_message(UserMessage(text=context))
        reply = (reply if isinstance(reply, str) else str(reply)).strip()
    except Exception as e:
        logger.error(f"voice chat llm error: {e}")
        raise HTTPException(500, "O CEO não conseguiu responder agora")

    await db.chat_messages.insert_one({"session_id": sid, "user_id": user["id"], "role": "assistant",
        "content": reply, "created_at": datetime.now(timezone.utc).isoformat()})

    audio_b64 = await synthesize_voice(reply)

    return {"session_id": sid, "user_text": user_text, "reply_text": reply, "audio_base64": audio_b64}
