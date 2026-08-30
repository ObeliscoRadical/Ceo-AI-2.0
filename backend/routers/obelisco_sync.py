from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import os

from core import db, get_current_user, active_company_id, invalidate_ai_cache
from obelisco_connector import (
    Obelisco360Connector,
    sync_obelisco_to_ceo_ai,
    DEFAULT_OBELISCO_URL,
    DEFAULT_OBELISCO_EMAIL,
    DEFAULT_OBELISCO_PASSWORD
)

router = APIRouter(prefix="/obelisco", tags=["obelisco-sync"])


class ObeliscoConfigInput(BaseModel):
    base_url: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


@router.get("/status")
async def get_obelisco_status(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    cred = await db.obelisco_credentials.find_one({"user_id": user["id"]}, {"password": 0})
    snapshot = await db.obelisco_snapshots.find_one({"user_id": user["id"], "company_id": cid}, {"_id": 0})
    
    has_credentials = bool(cred or (DEFAULT_OBELISCO_EMAIL and DEFAULT_OBELISCO_PASSWORD))
    return {
        "connected": bool(snapshot),
        "has_credentials": has_credentials,
        "host": (cred.get("base_url") if cred else DEFAULT_OBELISCO_URL),
        "email": (cred.get("email") if cred else DEFAULT_OBELISCO_EMAIL),
        "last_synced_at": snapshot.get("synced_at") if snapshot else None,
        "snapshot": snapshot,
    }


@router.post("/sync")
async def trigger_obelisco_sync(user: dict = Depends(get_current_user)):
    try:
        cid = await active_company_id(user["id"])
        cred = await db.obelisco_credentials.find_one({"user_id": user["id"]}) or {}
        
        base_url = cred.get("base_url") or DEFAULT_OBELISCO_URL
        email = cred.get("email") or DEFAULT_OBELISCO_EMAIL
        password = cred.get("password") or DEFAULT_OBELISCO_PASSWORD
        
        connector = Obelisco360Connector(base_url=base_url, email=email, password=password)
        snapshot = await sync_obelisco_to_ceo_ai(user_id=user["id"], company_id=cid, connector=connector)
        
        return {
            "ok": True,
            "message": "Sincronização 360° concluída com sucesso.",
            "synced_at": snapshot["synced_at"],
            "cash_balance": snapshot["cash_balance"],
            "annual_emitted_revenue": snapshot["annual_emitted_revenue"],
            "active_employees": snapshot["active_employees_count"],
            "total_works": snapshot["works_summary"]["total_count"],
            "snapshot": snapshot
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sincronização 360° com Obelisco: {str(e)}")


@router.post("/configure")
async def configure_obelisco(inp: ObeliscoConfigInput, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user["id"],
        "base_url": (inp.base_url or DEFAULT_OBELISCO_URL).strip().rstrip("/"),
        "email": (inp.email or DEFAULT_OBELISCO_EMAIL).strip(),
        "updated_at": now,
    }
    if inp.password:
        doc["password"] = inp.password.strip()
        
    await db.obelisco_credentials.update_one(
        {"user_id": user["id"]},
        {"": doc, "": {"created_at": now}},
        upsert=True
    )
    
    # Auto-test and sync immediately
    try:
        cred = await db.obelisco_credentials.find_one({"user_id": user["id"]})
        connector = Obelisco360Connector(cred["base_url"], cred["email"], cred.get("password", DEFAULT_OBELISCO_PASSWORD))
        snapshot = await sync_obelisco_to_ceo_ai(user["id"], connector=connector)
        return {"ok": True, "message": "Configurado e sincronizado com sucesso.", "snapshot": snapshot}
    except Exception as e:
        return {"ok": True, "message": f"Credenciais guardadas, mas o teste retornou: {str(e)}"}
