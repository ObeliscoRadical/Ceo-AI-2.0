"""TikTok Content Posting API & Login Kit integration router."""
import os
import uuid
import secrets
import hashlib
import base64
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import httpx

from core import db, logger, premium_user, active_company_id

router = APIRouter()

_RUNTIME_TIKTOK_CONFIG = {}

TIKTOK_SCOPES = [
    "user.info.basic",
    "video.publish",
    "video.upload"
]


def _base():
    url = (os.environ.get("FRONTEND_URL", "") or os.environ.get("RAILWAY_PUBLIC_DOMAIN", "") or "").rstrip("/")
    if url and not url.startswith("http"):
        url = f"https://{url}"
    return url or "https://ceo-ai-app-production.up.railway.app"


def _redirect_uri():
    return f"{_base()}/api/tiktok/callback"


async def _ensure_tiktok_config():
    if not _RUNTIME_TIKTOK_CONFIG.get("client_key"):
        try:
            doc = await db.tiktok_app_config.find_one({"type": "global"})
            if doc:
                if doc.get("client_key"):
                    _RUNTIME_TIKTOK_CONFIG["client_key"] = doc["client_key"]
                if doc.get("client_secret"):
                    _RUNTIME_TIKTOK_CONFIG["client_secret"] = doc["client_secret"]
        except Exception:
            pass


def _get_tiktok_cfg():
    ck = _RUNTIME_TIKTOK_CONFIG.get("client_key") or os.environ.get("TIKTOK_CLIENT_KEY", "")
    cs = _RUNTIME_TIKTOK_CONFIG.get("client_secret") or os.environ.get("TIKTOK_CLIENT_SECRET", "")
    return ck.strip(), cs.strip()


class TikTokConfigIn(BaseModel):
    client_key: str
    client_secret: str


@router.get("/tiktok/status")
async def tiktok_status(user: dict = Depends(premium_user)):
    await _ensure_tiktok_config()
    ck, cs = _get_tiktok_cfg()
    uid = user["id"]
    cid = await active_company_id(uid)
    conn = await db.tiktok_connections.find_one({"user_id": uid, "company_id": cid})
    
    return {
        "configured": bool(ck and cs),
        "client_key": ck,
        "client_key_present": bool(ck),
        "redirect_uri": _redirect_uri(),
        "connected": bool(conn and conn.get("access_token")),
        "open_id": conn.get("open_id") if conn else None,
        "username": conn.get("username") if conn else None,
        "display_name": conn.get("display_name") if conn else None,
        "avatar_url": conn.get("avatar_url") if conn else None,
        "follower_count": conn.get("follower_count") if conn else None,
        "granted_scopes": conn.get("granted_scopes", []) if conn else [],
        "token_expires_at": conn.get("token_expires_at") if conn else None,
        "publish_ready": bool(conn and conn.get("access_token") and "video.publish" in conn.get("granted_scopes", []))
    }


@router.post("/tiktok/config")
async def save_tiktok_config(inp: TikTokConfigIn, user: dict = Depends(premium_user)):
    ck = inp.client_key.strip()
    cs = inp.client_secret.strip()
    if not (ck and cs):
        raise HTTPException(400, "Preencha o Client Key e o Client Secret do TikTok.")
        
    _RUNTIME_TIKTOK_CONFIG["client_key"] = ck
    _RUNTIME_TIKTOK_CONFIG["client_secret"] = cs
    
    await db.tiktok_app_config.update_one(
        {"type": "global"},
        {"$set": {
            "type": "global",
            "client_key": ck,
            "client_secret": cs,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    return {"ok": True, "message": "Credenciais da App do TikTok guardadas com sucesso!"}


@router.get("/tiktok/connect")
async def tiktok_connect(user: dict = Depends(premium_user)):
    await _ensure_tiktok_config()
    ck, cs = _get_tiktok_cfg()
    if not (ck and cs):
        raise HTTPException(400, "Integração TikTok ainda não configurada (falta Client Key / Client Secret).")
        
    uid = user["id"]
    cid = await active_company_id(uid)
    state = secrets.token_urlsafe(24)
    code_verifier = secrets.token_urlsafe(32)
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip("=")
    
    await db.tiktok_oauth_states.insert_one({
        "_id": state,
        "user_id": uid,
        "company_id": cid,
        "code_verifier": code_verifier,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
    })
    
    q = {
        "client_key": ck,
        "scope": ",".join(TIKTOK_SCOPES),
        "response_type": "code",
        "redirect_uri": _redirect_uri(),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256"
    }
    auth_url = f"https://www.tiktok.com/v2/auth/authorize/?{urllib.parse.urlencode(q)}"
    return {"auth_url": auth_url}


@router.get("/tiktok/callback")
async def tiktok_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None, error_description: Optional[str] = None):
    base = _base()
    if error:
        return RedirectResponse(f"{base}/marketing?tiktok_error={urllib.parse.quote(error_description or error)}")
        
    st = await db.tiktok_oauth_states.find_one_and_delete({"_id": state or "", "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not st or not code:
        return RedirectResponse(f"{base}/marketing?tiktok_error=estado_invalido")
        
    uid = st["user_id"]
    cid = st.get("company_id") or await active_company_id(uid)
    code_verifier = st.get("code_verifier")
    
    await _ensure_tiktok_config()
    ck, cs = _get_tiktok_cfg()
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            token_res = await client.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_key": ck,
                    "client_secret": cs,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": _redirect_uri(),
                    "code_verifier": code_verifier or ""
                }
            )
            token_data = token_res.json()
            if "access_token" not in token_data:
                err_msg = token_data.get("error_description") or token_data.get("message") or "Erro na troca de token"
                logger.error(f"TikTok token exchange error: {token_data}")
                return RedirectResponse(f"{base}/marketing?tiktok_error={urllib.parse.quote(err_msg)}")
                
            access_token = token_data["access_token"]
            refresh_token = token_data.get("refresh_token")
            open_id = token_data.get("open_id")
            expires_in = token_data.get("expires_in", 86400)
            scope_str = token_data.get("scope", "")
            granted_scopes = [s.strip() for s in scope_str.split(",") if s.strip()]
            
            # Obter perfil do utilizador TikTok
            user_info = {}
            try:
                info_res = await client.get(
                    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,follower_count",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                if info_res.status_code == 200:
                    user_info = (info_res.json().get("data") or {}).get("user") or {}
            except Exception as e:
                logger.warning(f"TikTok user info note: {e}")
                
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
            now_iso = datetime.now(timezone.utc).isoformat()
            
            conn_doc = {
                "user_id": uid,
                "company_id": cid,
                "status": "connected",
                "open_id": open_id,
                "username": user_info.get("username"),
                "display_name": user_info.get("display_name"),
                "avatar_url": user_info.get("avatar_url"),
                "follower_count": user_info.get("follower_count", 0),
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_expires_at": expires_at,
                "granted_scopes": granted_scopes or TIKTOK_SCOPES,
                "updated_at": now_iso
            }
            
            await db.tiktok_connections.update_one(
                {"user_id": uid, "company_id": cid},
                {"$set": conn_doc},
                upsert=True
            )
            
            return RedirectResponse(f"{base}/marketing?tiktok_connected=1")
    except Exception as e:
        logger.error(f"TikTok OAuth callback exception: {e}")
        return RedirectResponse(f"{base}/marketing?tiktok_error=falha_servidor")


@router.post("/tiktok/disconnect")
async def tiktok_disconnect(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    await db.tiktok_connections.delete_one({"user_id": uid, "company_id": cid})
    return {"ok": True, "message": "Conta do TikTok desconectada com sucesso."}


class TikTokPublishIn(BaseModel):
    video_url: str
    title: str = ""
    privacy_level: str = "PUBLIC_TO_EVERYONE"  # "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"
    disable_duet: bool = False
    disable_comment: bool = False
    disable_stitch: bool = False


@router.post("/tiktok/publish")
async def tiktok_publish_video(inp: TikTokPublishIn, user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    conn = await db.tiktok_connections.find_one({"user_id": uid, "company_id": cid})
    if not conn or not conn.get("access_token"):
        raise HTTPException(400, "Conta do TikTok não está conectada.")
        
    access_token = conn["access_token"]
    
    # Iniciar publicação via TikTok Content Posting API (PULL_FROM_URL)
    payload = {
        "post_info": {
            "title": inp.title[:150],
            "privacy_level": inp.privacy_level,
            "disable_duet": inp.disable_duet,
            "disable_comment": inp.disable_comment,
            "disable_stitch": inp.disable_stitch,
            "video_cover_timestamp_ms": 1000
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "video_url": inp.video_url
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8"
                },
                json=payload
            )
            data = res.json()
            if res.status_code != 200 or ("error" in data and data["error"].get("code") != "ok"):
                err = data.get("error", {}).get("message") or "Erro ao publicar no TikTok"
                logger.error(f"TikTok publish error: {data}")
                raise HTTPException(502, f"Erro retornado pela API do TikTok: {err}")
                
            publish_id = (data.get("data") or {}).get("publish_id")
            return {
                "ok": True,
                "message": "Vídeo enviado com sucesso para publicação no TikTok!",
                "publish_id": publish_id
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TikTok publish exception: {e}")
        raise HTTPException(500, f"Erro ao comunicar com a API do TikTok: {e}")
