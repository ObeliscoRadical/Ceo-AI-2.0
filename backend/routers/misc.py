from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *

router = APIRouter()

@router.get("/push/vapid-public-key")
async def push_vapid_key(user: dict = Depends(get_current_user)):
    cfg = await ensure_vapid()
    return {"publicKey": cfg["public"]}

@router.post("/push/subscribe")
async def push_subscribe(inp: PushSubscriptionInput, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.update_one(
        {"endpoint": inp.endpoint},
        {"$set": {"user_id": user["id"], "endpoint": inp.endpoint, "keys": inp.keys,
                  "created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True}

@router.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    n = await send_push_to_user(user["id"], "CEO AI 2.0", "Notificações ativas ✅ Vou avisar-te sobre o valor da tua empresa.", "/")
    if n == 0:
        raise HTTPException(status_code=400, detail="Nenhum dispositivo subscrito. Ativa as notificações primeiro neste aparelho.")
    return {"ok": True, "sent": n}

@router.post("/contact")
async def contact(inp: ContactInput):
    await db.contact_messages.insert_one({
        "name": inp.name, "email": inp.email.lower(), "message": inp.message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@router.get("/")
async def root():
    return {"message": "CEO AI 2.0 online"}
