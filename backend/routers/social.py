"""Fase 4 — Publicação automática nas redes (Instagram + Facebook via Meta Graph API).
Agora com isolamento por empresa, diagnóstico de ligação e sincronização com o workflow editorial."""
import asyncio, os, base64, uuid, hmac, hashlib, secrets
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, quote
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import httpx
from core import (
    active_company_id,
    composite_logo,
    db,
    generate_marketing_image,
    logger,
    prepare_logo,
    premium_user,
    UPLOAD_DIR,
)
from routers.marketing import apply_post_status, record_marketing_metrics

router = APIRouter()

SCOPES = [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "read_insights",
    "business_management",
]
REQUIRED_PAGE_TASKS = {"CREATE_CONTENT", "MANAGE"}
INSIGHTS_SCOPE_HINTS = {"instagram_manage_insights", "instagram_basic", "pages_read_engagement", "read_insights"}
ACCOUNT_INSIGHTS_PROBES = [
    {"metric": "reach,profile_views", "period": "day"},
    {"metric": "impressions,reach,profile_views", "period": "day"},
    {"metric": "accounts_reached,profile_views,website_clicks", "period": "day"},
]
MEDIA_INSIGHTS_PROBES = [
    {"metric": "reach,saved,shares,total_interactions,views,impressions"},
    {"metric": "reach,saved,shares,total_interactions,views"},
    {"metric": "reach,saved,shares"},
]
AUTO_DIAGNOSTICS_TTL = timedelta(minutes=15)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _granular_scope_name(item) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ""
    return str(item.get("scope") or item.get("permission") or item.get("name") or "").strip()


def _granular_scope_granted(item) -> bool:
    if not isinstance(item, dict):
        return bool(item)
    if item.get("is_granted") is False:
        return False
    status = str(item.get("status") or item.get("state") or "").strip().lower()
    if status and status not in {"granted", "live", "confirmed", "active"}:
        return False
    return True


def _scope_set(conn: Optional[dict]) -> set[str]:
    scopes = {str(item).strip() for item in ((conn or {}).get("granted_scopes") or []) if str(item).strip()}
    for item in ((conn or {}).get("granular_scopes") or []):
        scope_name = _granular_scope_name(item)
        if scope_name and _granular_scope_granted(item):
            scopes.add(scope_name)
    return scopes


def _missing_insights_scopes(conn: Optional[dict]) -> list[str]:
    scopes = _scope_set(conn)
    if not scopes:
        return []
    return sorted(item for item in INSIGHTS_SCOPE_HINTS if item not in scopes)


def _meta_error_payload(error: Exception) -> dict:
    detail = getattr(error, "detail", None)
    if isinstance(detail, dict):
        meta_error = detail.get("meta_error")
        if isinstance(meta_error, dict):
            return meta_error
        if isinstance(meta_error, str):
            return {"message": meta_error}
        return detail
    return {"message": str(detail or error)}


def _meta_error_message(error: Exception) -> str:
    payload = _meta_error_payload(error)
    return str(payload.get("message") or payload).strip()


def _meta_error_code(error: Exception) -> int:
    payload = _meta_error_payload(error)
    try:
        return int(payload.get("code") or 0)
    except Exception:
        return 0


def _meta_error_subcode(error: Exception) -> int:
    payload = _meta_error_payload(error)
    try:
        return int(payload.get("error_subcode") or payload.get("error_subcode") or 0)
    except Exception:
        return 0


def _is_token_error(error: Exception) -> bool:
    code = _meta_error_code(error)
    message = _meta_error_message(error).lower()
    return code == 190 or "token" in message and any(word in message for word in ["expir", "invalid", "inválido"])


def _is_invalid_metric_error(error: Exception) -> bool:
    message = _meta_error_message(error).lower()
    return "metric" in message and any(word in message for word in ["invalid", "not valid", "unsupported", "não é válido", "not supported"])


def _is_permission_error(error: Exception) -> bool:
    code = _meta_error_code(error)
    subcode = _meta_error_subcode(error)
    message = _meta_error_message(error).lower()
    return (
        code in {10, 200}
        or subcode in {33, 2108006}
        or "permission" in message
        or "permissions" in message
        or "not authorized" in message
        or "requires the instagram_manage_insights permission" in message
        or "requires read_insights permission" in message
    )


def _insights_payload_has_values(payload: dict) -> bool:
    for item in (payload.get("data") or []):
        values = item.get("values") or []
        if values:
            return True
        if item.get("value") is not None:
            return True
    return False


def _insights_permissions_ready(conn: Optional[dict]) -> bool:
    if not (_conn_ready(conn) and conn and conn.get("ig_user_id")):
        return False
    status = str((conn or {}).get("insights_status") or "").strip().lower()
    if status in {"ready", "no_data"}:
        return True
    checks = (((conn or {}).get("last_diagnostics") or {}).get("checks") or [])
    insights_check = next((item for item in checks if item.get("id") == "meta_insights_permissions"), None)
    if insights_check is not None and bool(insights_check.get("ok")):
        return True
    scopes = _scope_set(conn)
    return bool(scopes and not _missing_insights_scopes(conn))


def _derived_insights_status(conn: Optional[dict]) -> str:
    status = str((conn or {}).get("insights_status") or "").strip().lower()
    if status:
        return status
    if _live_metrics_ready(conn):
        return "ready"
    if _insights_permissions_ready(conn):
        return "permission_ready"
    if conn and conn.get("ig_user_id"):
        return "unverified"
    return "unavailable"


def _live_metrics_ready(conn: Optional[dict]) -> bool:
    if not _conn_ready(conn) or not conn or not conn.get("ig_user_id"):
        return False
    insights_status = str((conn or {}).get("insights_status") or "").strip().lower()
    if insights_status:
        return insights_status == "ready"
    last_checks = (((conn or {}).get("last_diagnostics") or {}).get("checks") or [])
    insights_probe_check = next((item for item in last_checks if item.get("id") == "meta_live_insights_probe"), None)
    if insights_probe_check is not None:
        return bool(insights_probe_check.get("ok")) and str((conn or {}).get("report_source") or "").strip().lower() == "real"
    return False


def _first_env(*names, default=""):
    for name in names:
        value = os.environ.get(name)
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return default


def _graph_ver() -> str:
    return _first_env("META_GRAPH_VERSION", "META GRAPH VERSION", default="v25.0")


_RUNTIME_META_CONFIG = {}

async def _ensure_meta_runtime_config():
    if not _RUNTIME_META_CONFIG.get("app_id"):
        try:
            doc = await db.meta_app_config.find_one({"type": "global"})
            if doc:
                if doc.get("app_id"):
                    _RUNTIME_META_CONFIG["app_id"] = doc["app_id"]
                if doc.get("app_secret"):
                    _RUNTIME_META_CONFIG["app_secret"] = doc["app_secret"]
                if doc.get("config_id"):
                    _RUNTIME_META_CONFIG["config_id"] = doc["config_id"]
        except Exception:
            pass


def _meta_config_id() -> str:
    return _RUNTIME_META_CONFIG.get("config_id") or _first_env("META_CONFIG_ID", "META CONFIG ID") or ""


def _cfg():
    aid = _RUNTIME_META_CONFIG.get("app_id") or _first_env("META_APP_ID", "META APP ID")
    sec = _RUNTIME_META_CONFIG.get("app_secret") or _first_env("META_APP_SECRET", "META APP SECRET")
    return aid, sec


def _app_token() -> str:
    aid, sec = _cfg()
    return f"{aid}|{sec}" if aid and sec else ""


def _base():
    url = (os.environ.get("FRONTEND_URL", "") or os.environ.get("RAILWAY_PUBLIC_DOMAIN", "") or "").rstrip("/")
    if url and not url.startswith("http"):
        url = f"https://{url}"
    return url or "https://ceo-ai-app-production.up.railway.app"


def _redirect_uri():
    return f"{_base()}/api/social/callback"


def _graph(path: str) -> str:
    return f"https://graph.facebook.com/{_graph_ver()}/{path.lstrip('/')}"


def _proof(token: str) -> Optional[str]:
    _, sec = _cfg()
    if not sec or not sec.strip():
        return None
    try:
        return hmac.new(sec.strip().encode(), token.encode(), hashlib.sha256).hexdigest()
    except Exception:
        return None


def _epoch_iso(value) -> Optional[str]:
    try:
        value = int(value or 0)
    except Exception:
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


async def _graph_req(method: str, url: str, params: dict, token: str) -> dict:
    req_params = {**params, "access_token": token}
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.request(method, url, params=req_params)
    try:
        data = r.json()
    except Exception:
        raise HTTPException(502, {"meta_error": r.text[:400]})
    if r.is_error or "error" in data:
        raise HTTPException(502, {"meta_error": data.get("error", data)})
    return data


async def _debug_token(token: str) -> dict:
    app_token = _app_token()
    if not app_token or not token:
        return {}
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.get(_graph("debug_token"), params={
            "input_token": token,
            "access_token": app_token,
        })
    data = r.json() if r.content else {}
    if r.is_error or "error" in data:
        return {}
    return data.get("data") or {}


async def _find_connection(uid: str, cid: Optional[str]):
    if cid:
        conn = await db.social_connections.find_one({"user_id": uid, "company_id": cid})
        if conn:
            return conn
    legacy = await db.social_connections.find_one({"user_id": uid, "company_id": {"$exists": False}})
    if legacy and cid:
        await db.social_connections.update_one(
            {"_id": legacy["_id"]},
            {"$set": {"company_id": cid, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        legacy["company_id"] = cid
    return legacy


def _conn_state(conn: Optional[dict]) -> str:
    if not conn:
        return "not_connected"
    if conn.get("status"):
        return conn.get("status")
    if conn.get("page_id") and conn.get("page_token"):
        return "connected"
    return "not_connected"


def _conn_ready(conn: Optional[dict]) -> bool:
    return bool(conn and _conn_state(conn) == "connected" and conn.get("page_id") and conn.get("page_token"))


def _has_publish_task(tasks) -> bool:
    return bool(set(tasks or []) & REQUIRED_PAGE_TASKS)


def _requirements(aid: str, sec: str):
    missing = []
    if not aid:
        missing.append("META_APP_ID")
    if not sec:
        missing.append("META_APP_SECRET")
    recommended = []
    if not _meta_config_id():
        recommended.append("META_CONFIG_ID")
    return missing, recommended


def _candidate_public(candidate: dict) -> dict:
    return {
        "page_id": candidate.get("page_id"),
        "page_name": candidate.get("page_name") or "Página sem nome",
        "ig_user_id": candidate.get("ig_user_id"),
        "ig_username": candidate.get("ig_username"),
        "has_instagram": bool(candidate.get("ig_user_id")),
        "tasks": candidate.get("tasks") or [],
        "publish_ready": _has_publish_task(candidate.get("tasks") or []),
    }


def _base_checks(aid: str, sec: str, conn: Optional[dict]):
    state = _conn_state(conn)
    checks = []
    
    if state == "not_connected":
        missing, recommended = _requirements(aid, sec)
        checks.append({
            "id": "meta_app_credentials",
            "label": "Credenciais da app Meta",
            "ok": not missing,
            "detail": "Prontas para OAuth." if not missing else f"Em falta: {', '.join(missing)}.",
        })
        checks.append({
            "id": "meta_oauth",
            "label": "Ligação com a Meta",
            "ok": False,
            "detail": "Ligue Facebook + Instagram via Token do Developer ou Facebook Login.",
        })
    elif state == "pending_selection":
        checks.append({
            "id": "meta_page_selection",
            "label": "Escolha da página",
            "ok": False,
            "detail": "Sessão concluída. Falta escolher qual Página de Facebook/Instagram deve ficar ligada.",
        })
    else:
        checks.extend([
            {
                "id": "meta_token_active",
                "label": "Token de Acesso Meta",
                "ok": True,
                "detail": "Token ativo e validado com sucesso.",
            },
            {
                "id": "meta_page_selected",
                "label": "Página Facebook ligada",
                "ok": bool(conn and conn.get("page_id")),
                "detail": conn.get("page_name") or "Página ligada",
            },
            {
                "id": "meta_publish_tasks",
                "label": "Permissões de publicação",
                "ok": _has_publish_task((conn or {}).get("tasks") or []),
                "detail": "Permissões ativas para publicação de posts e carrosséis.",
            },
            {
                "id": "meta_insights_permissions",
                "label": "Analytics & Métricas",
                "ok": _insights_permissions_ready(conn),
                "detail": "Métricas reais ativas via Meta Graph API.",
            },
        ])
    return checks


def _status_payload(conn: Optional[dict], aid: str, sec: str, checks: Optional[list] = None):
    missing, recommended = _requirements(aid, sec)
    state = _conn_state(conn)
    connected = _conn_ready(conn)
    available_pages = [_candidate_public(item) for item in ((conn or {}).get("candidate_pages") or [])]
    live_ready = _live_metrics_ready(conn)
    insights_status = _derived_insights_status(conn)
    permissions_ready = _insights_permissions_ready(conn)
    return {
        "configured": bool(aid and sec),
        "missing_config": missing,
        "recommended_config": recommended,
        "config_id_present": bool(_meta_config_id()),
        "redirect_uri": _redirect_uri(),
        "connected": connected,
        "pending_selection": state == "pending_selection",
        "connection_state": state,
        "page_name": conn.get("page_name") if conn else None,
        "ig_username": conn.get("ig_username") if conn else None,
        "has_instagram": bool(conn and conn.get("ig_user_id")),
        "has_facebook": bool(conn and conn.get("page_id")),
        "selected_tasks": (conn or {}).get("tasks") or [],
        "granted_scopes": (conn or {}).get("granted_scopes") or [],
        "granular_scopes": (conn or {}).get("granular_scopes") or [],
        "token_expires_at": (conn or {}).get("token_expires_at"),
        "data_access_expires_at": (conn or {}).get("data_access_expires_at"),
        "insights_status": insights_status,
        "insights_permissions_ready": permissions_ready,
        "insights_last_checked_at": (conn or {}).get("insights_last_checked_at") or (conn or {}).get("last_validated_at"),
        "insights_probe_detail": (conn or {}).get("insights_probe_detail"),
        "report_source": (conn or {}).get("report_source") or ("real" if live_ready else "mock"),
        "checks": checks or ((conn or {}).get("last_diagnostics") or {}).get("checks") or _base_checks(aid, sec, conn),
        "available_pages": available_pages,
        "metrics_mocked": not live_ready,
        "live_metrics_ready": live_ready,
        "publish_ready_facebook": bool(connected and _has_publish_task((conn or {}).get("tasks") or [])),
        "publish_ready_instagram": bool(connected and conn and conn.get("ig_user_id")),
    }


async def _fetch_token_debug(token: str) -> dict:
    info = await _debug_token(token)
    if not info:
        return {"granted_scopes": []}
    return {
        "granted_scopes": info.get("scopes") or [],
        "granular_scopes": info.get("granular_scopes") or [],
        "token_expires_at": _epoch_iso(info.get("expires_at")),
        "data_access_expires_at": _epoch_iso(info.get("data_access_expires_at")),
        "meta_user_id": info.get("user_id"),
        "token_is_valid": bool(info.get("is_valid")),
    }


def _should_auto_diagnose(conn: Optional[dict], force: bool = False) -> bool:
    if force:
        return True
    if not _conn_ready(conn):
        return False
    if not conn:
        return False
    insights_status = str(conn.get("insights_status") or "").strip().lower()
    if insights_status in {"", "unverified", "unknown", "permission_ready"}:
        return True
    checked_at = _parse_iso(conn.get("insights_last_checked_at") or conn.get("last_validated_at"))
    if not checked_at:
        return True
    return datetime.now(timezone.utc) - checked_at >= AUTO_DIAGNOSTICS_TTL


async def _probe_recent_media_insights(uid: str, cid: Optional[str], token: str) -> Optional[dict]:
    posts = await db.social_posts.find(
        {"user_id": uid, "company_id": cid, "results.instagram.id": {"$exists": True, "$ne": None}},
        {"_id": 0, "results.instagram.id": 1},
    ).sort("created_at", -1).to_list(8)
    for social_post in posts:
        media_id = (((social_post.get("results") or {}).get("instagram") or {}).get("id"))
        if not media_id:
            continue
        empty_success = False
        for params in MEDIA_INSIGHTS_PROBES:
            try:
                insights = await _graph_req("GET", _graph(f"{media_id}/insights"), params, token)
                if _insights_payload_has_values(insights):
                    return {
                        "ready": True,
                        "permissions_ready": True,
                        "status": "ready",
                        "detail": "A Meta respondeu com insights reais de media do Instagram.",
                        "source": "instagram_media_insights_probe",
                    }
                empty_success = True
                break
            except Exception as error:
                if _is_invalid_metric_error(error):
                    continue
                if _is_token_error(error):
                    return {
                        "ready": False,
                        "permissions_ready": False,
                        "status": "expired",
                        "detail": _meta_error_message(error) or "O token Meta expirou e precisa de reconnect.",
                        "source": "instagram_media_insights_probe",
                    }
                if _is_permission_error(error):
                    return {
                        "ready": False,
                        "permissions_ready": False,
                        "status": "permission_denied",
                        "detail": _meta_error_message(error) or "A Meta recusou a leitura de insights deste media.",
                        "source": "instagram_media_insights_probe",
                    }
                return {
                    "ready": False,
                    "permissions_ready": False,
                    "status": "unavailable",
                    "detail": _meta_error_message(error) or "A Meta não respondeu ao probe de media insights.",
                    "source": "instagram_media_insights_probe",
                }
        if empty_success:
            return {
                "ready": False,
                "permissions_ready": True,
                "status": "no_data",
                "detail": "As permissões de insights estão válidas, mas os media publicados ainda não devolveram dados utilizáveis.",
                "source": "instagram_media_insights_probe",
            }
    return None


async def _probe_live_insights(uid: str, cid: Optional[str], conn: Optional[dict]) -> dict:
    checked_at = datetime.now(timezone.utc).isoformat()
    if not _conn_ready(conn):
        return {
            "ready": False,
            "permissions_ready": False,
            "status": "unavailable",
            "detail": "A ligação Meta ainda não está pronta para validar insights.",
            "source": "unavailable",
            "checked_at": checked_at,
            "report_source": "mock",
        }
    ig_user_id = (conn or {}).get("ig_user_id")
    token = (conn or {}).get("user_token") or (conn or {}).get("page_token")
    if not ig_user_id or not token:
        return {
            "ready": False,
            "permissions_ready": False,
            "status": "unavailable",
            "detail": "Falta o Instagram profissional ou o token necessário para validar insights.",
            "source": "unavailable",
            "checked_at": checked_at,
            "report_source": "mock",
        }

    no_data_result = None
    last_unavailable_error = None
    for params in ACCOUNT_INSIGHTS_PROBES:
        try:
            insights = await _graph_req("GET", _graph(f"{ig_user_id}/insights"), params, token)
            if _insights_payload_has_values(insights):
                return {
                    "ready": True,
                    "permissions_ready": True,
                    "status": "ready",
                    "detail": "A Meta respondeu com insights reais da conta Instagram.",
                    "source": "instagram_account_insights_probe",
                    "checked_at": checked_at,
                    "report_source": "real",
                }
            no_data_result = {
                "ready": False,
                "permissions_ready": True,
                "status": "no_data",
                "detail": "As permissões de insights estão válidas, mas a Meta ainda não devolveu dados suficientes nesta ligação.",
                "source": "instagram_account_insights_probe",
                "checked_at": checked_at,
                "report_source": "mock",
            }
            break
        except Exception as error:
            if _is_invalid_metric_error(error):
                continue
            if _is_token_error(error):
                return {
                    "ready": False,
                    "permissions_ready": False,
                    "status": "expired",
                    "detail": _meta_error_message(error) or "O token Meta expirou e precisa de reconnect.",
                    "source": "instagram_account_insights_probe",
                    "checked_at": checked_at,
                    "report_source": "mock",
                }
            if _is_permission_error(error):
                return {
                    "ready": False,
                    "permissions_ready": False,
                    "status": "permission_denied",
                    "detail": _meta_error_message(error) or "A Meta recusou a leitura de insights nesta ligação.",
                    "source": "instagram_account_insights_probe",
                    "checked_at": checked_at,
                    "report_source": "mock",
                }
            last_unavailable_error = error

    media_probe = await _probe_recent_media_insights(uid, cid, token)
    if media_probe:
        return {**media_probe, "checked_at": checked_at, "report_source": "real" if media_probe.get("ready") else "mock"}
    if no_data_result:
        return no_data_result
    if last_unavailable_error is not None:
        return {
            "ready": False,
            "permissions_ready": False,
            "status": "unavailable",
            "detail": _meta_error_message(last_unavailable_error) or "A Meta não respondeu ao probe de insights.",
            "source": "instagram_account_insights_probe",
            "checked_at": checked_at,
            "report_source": "mock",
        }
    return {
        "ready": False,
        "permissions_ready": _insights_permissions_ready(conn),
        "status": "unavailable",
        "detail": "Não foi possível validar insights reais com a Meta nesta tentativa.",
        "source": "instagram_account_insights_probe",
        "checked_at": checked_at,
        "report_source": "mock",
    }


async def _hydrate_candidate(page: dict) -> dict:
    item = {
        "page_id": page.get("id"),
        "page_name": page.get("name") or "Página sem nome",
        "page_token": page.get("access_token"),
        "tasks": page.get("tasks") or [],
        "ig_user_id": ((page.get("instagram_business_account") or {}).get("id")),
        "ig_username": None,
    }
    if item["ig_user_id"] and item["page_token"]:
        try:
            igd = await _graph_req("GET", _graph(item["ig_user_id"]), {"fields": "username"}, item["page_token"])
            item["ig_username"] = igd.get("username")
        except Exception as e:
            logger.error(f"social hydrate ig username: {e}")
    return item


async def _finalize_connection(uid: str, cid: Optional[str], current: Optional[dict], chosen: dict, user_token: str, token_debug: Optional[dict] = None):
    token_debug = token_debug or {}
    await db.social_connections.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {
            "user_id": uid,
            "company_id": cid,
            "status": "connected",
            "meta_user_id": token_debug.get("meta_user_id") or (current or {}).get("meta_user_id"),
            "page_id": chosen.get("page_id"),
            "page_name": chosen.get("page_name"),
            "ig_user_id": chosen.get("ig_user_id"),
            "ig_username": chosen.get("ig_username"),
            "tasks": chosen.get("tasks") or [],
            "page_token": chosen.get("page_token"),
            "user_token": user_token,
            "granted_scopes": token_debug.get("granted_scopes") or (current or {}).get("granted_scopes") or [],
            "granular_scopes": token_debug.get("granular_scopes") or (current or {}).get("granular_scopes") or [],
            "token_expires_at": token_debug.get("token_expires_at") or (current or {}).get("token_expires_at"),
            "data_access_expires_at": token_debug.get("data_access_expires_at") or (current or {}).get("data_access_expires_at"),
            "insights_status": "unverified",
            "report_source": "mock",
            "insights_last_checked_at": None,
            "insights_probe_source": None,
            "insights_probe_detail": None,
            "candidate_pages": (current or {}).get("candidate_pages") or ([chosen] if chosen else []),
            "last_diagnostics": {"checks": _base_checks(*_cfg(), {**(current or {}), **chosen, **token_debug, "status": "connected", "insights_status": "unverified", "report_source": "mock"})},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


async def _run_diagnostics(uid: str, cid: Optional[str], conn: Optional[dict], aid: str, sec: str):
    if not (aid and sec) or not _conn_ready(conn):
        return _base_checks(aid, sec, conn), _conn_state(conn), {}

    state = "connected"
    patch = {}
    runtime_checks = []
    probe_conn = {**(conn or {})}
    token_debug = await _fetch_token_debug(conn.get("user_token"))
    if token_debug:
        patch.update({
            "meta_user_id": token_debug.get("meta_user_id") or conn.get("meta_user_id"),
            "granted_scopes": token_debug.get("granted_scopes") or [],
            "granular_scopes": token_debug.get("granular_scopes") or [],
            "token_expires_at": token_debug.get("token_expires_at"),
            "data_access_expires_at": token_debug.get("data_access_expires_at"),
        })
        probe_conn.update(patch)
        runtime_checks.append({
            "id": "meta_user_token",
            "label": "Token do utilizador Meta",
            "ok": bool(token_debug.get("token_is_valid")),
            "detail": f"Token válido até {token_debug.get('token_expires_at')}." if token_debug.get("token_is_valid") and token_debug.get("token_expires_at") else ("Token válido." if token_debug.get("token_is_valid") else "Não foi possível validar o token do utilizador Meta."),
        })
        if token_debug.get("token_is_valid") is False:
            state = "degraded"

    try:
        page = await _graph_req("GET", _graph(conn["page_id"]), {"fields": "id,name"}, conn["page_token"])
        runtime_checks.append({
            "id": "meta_page_api",
            "label": "API da Página",
            "ok": True,
            "detail": f"Ligação confirmada à página {page.get('name') or conn.get('page_name') or 'Página'}.",
        })
    except Exception:
        state = "degraded"
        runtime_checks.append({
            "id": "meta_page_api",
            "label": "API da Página",
            "ok": False,
            "detail": "A página não respondeu. Reconecte a Meta para renovar o token.",
        })

    try:
        pages = await _graph_req("GET", _graph("me/accounts"), {"fields": "id,name,tasks,instagram_business_account"}, conn["user_token"])
        selected = next((item for item in pages.get("data", []) if item.get("id") == conn.get("page_id")), None)
        if selected:
            patch["tasks"] = selected.get("tasks") or []
            patch["ig_user_id"] = ((selected.get("instagram_business_account") or {}).get("id")) or conn.get("ig_user_id")
            probe_conn.update({k: v for k, v in patch.items() if v is not None})
            runtime_checks.append({
                "id": "meta_selected_page",
                "label": "Página selecionada na sessão Meta",
                "ok": True,
                "detail": f"Página confirmada com tasks: {', '.join(patch['tasks']) or 'sem tasks visíveis'}.",
            })
        else:
            state = "degraded"
            runtime_checks.append({
                "id": "meta_selected_page",
                "label": "Página selecionada na sessão Meta",
                "ok": False,
                "detail": "A página selecionada já não apareceu no /me/accounts da Meta.",
            })
    except Exception:
        state = "degraded"
        runtime_checks.append({
            "id": "meta_selected_page",
            "label": "Página selecionada na sessão Meta",
            "ok": False,
            "detail": "Não foi possível voltar a enumerar as páginas da Meta.",
        })

    ig_user_id = patch.get("ig_user_id") or conn.get("ig_user_id")
    if ig_user_id:
        try:
            token = conn.get("page_token") or conn.get("user_token")
            ig = await _graph_req("GET", _graph(ig_user_id), {"fields": "id,username"}, token)
            patch["ig_username"] = ig.get("username") or conn.get("ig_username")
            probe_conn.update({k: v for k, v in patch.items() if v is not None})
            runtime_checks.append({
                "id": "meta_ig_api",
                "label": "API do Instagram",
                "ok": True,
                "detail": f"Instagram profissional validado: @{patch.get('ig_username') or 'conta ligada'}.",
            })
        except Exception:
            state = "degraded"
            runtime_checks.append({
                "id": "meta_ig_api",
                "label": "API do Instagram",
                "ok": False,
                "detail": "Não foi possível validar o Instagram profissional ligado à Página.",
            })
    insights_probe = await _probe_live_insights(uid, cid, probe_conn)
    patch.update({
        "insights_status": insights_probe.get("status"),
        "report_source": insights_probe.get("report_source"),
        "insights_last_checked_at": insights_probe.get("checked_at"),
        "insights_probe_source": insights_probe.get("source"),
        "insights_probe_detail": insights_probe.get("detail"),
    })
    probe_conn.update({k: v for k, v in patch.items() if v is not None})
    runtime_checks.append({
        "id": "meta_live_insights_probe",
        "label": "Probe de insights reais",
        "ok": bool(insights_probe.get("ready") or insights_probe.get("permissions_ready")),
        "detail": insights_probe.get("detail") or "A validação de insights reais não devolveu detalhe adicional.",
    })
    if insights_probe.get("status") == "expired":
        state = "degraded"
    checks = _base_checks(aid, sec, probe_conn)
    checks.extend(runtime_checks)
    return checks, state, patch


async def _refresh_connection_runtime_state(uid: str, cid: Optional[str], aid: str, sec: str,
                                           conn: Optional[dict], force: bool = False):
    if not conn or not _should_auto_diagnose(conn, force=force):
        return conn
    checks, state, patch = await _run_diagnostics(uid, cid, conn, aid, sec)
    await db.social_connections.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {
            "status": state if state != "not_connected" else (conn.get("status") or "not_connected"),
            **patch,
            "last_diagnostics": {"checks": checks},
            "last_validated_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await _find_connection(uid, cid)


async def _migrate_legacy_jobs(uid: str, cid: Optional[str]):
    if not cid:
        return
    await db.social_jobs.update_many(
        {"user_id": uid, "company_id": {"$exists": False}},
        {"$set": {"company_id": cid}},
    )


async def _sync_marketing_post(uid: str, cid: Optional[str], post_id: Optional[str], status: str,
                               scheduled_at: Optional[str] = None, published_at: Optional[str] = None):
    if not (uid and cid and post_id):
        return
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    if not doc or not doc.get("content"):
        return
    content = doc.get("content") or {}
    if not apply_post_status(content, post_id, status, scheduled_at=scheduled_at, published_at=published_at):
        return
    await db.marketing_content.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {"content": content, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


async def _marketing_post_meta(uid: str, cid: Optional[str], post_id: Optional[str]):
    if not (uid and cid and post_id):
        return {}
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid}, {"_id": 0, "content.posts": 1})
    for post in (((doc or {}).get("content") or {}).get("posts") or []):
        if post.get("id") == post_id:
            return {
                "id": post.get("id"),
                "titulo": post.get("titulo"),
                "tema": post.get("tema"),
                "formato": post.get("formato"),
                "status": post.get("status"),
            }
    return {}


def _metric_number(value) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, dict):
        numeric = [int(v) for v in value.values() if isinstance(v, (int, float))]
        return sum(numeric) if numeric else 0
    return 0


def _metric_from_insights(payload: dict, name: str) -> int:
    for item in (payload.get("data") or []):
        if item.get("name") != name:
            continue
        values = item.get("values") or []
        if not values:
            return 0
        return _metric_number((values[0] or {}).get("value"))
    return 0


async def _fetch_live_post_metrics(conn: Optional[dict], social_post_doc: dict) -> Optional[dict]:
    if not _live_metrics_ready(conn):
        return None
    ig_result = ((social_post_doc.get("results") or {}).get("instagram") or {})
    media_id = ig_result.get("id")
    if not media_id:
        return None
    token = (conn or {}).get("user_token") or (conn or {}).get("page_token")
    if not token:
        return None
    try:
        media = await _graph_req("GET", _graph(media_id), {"fields": "id,like_count,comments_count,media_product_type,permalink,timestamp"}, token)
        insights = None
        for metric_set in [
            "reach,saved,shares,total_interactions,views,impressions",
            "reach,saved,shares,total_interactions,views",
            "reach,saved,shares",
        ]:
            try:
                insights = await _graph_req("GET", _graph(f"{media_id}/insights"), {"metric": metric_set}, token)
                break
            except Exception:
                continue
        if insights is None:
            return None

        likes = int(media.get("like_count") or 0)
        comments = int(media.get("comments_count") or 0)
        shares = _metric_from_insights(insights, "shares")
        saves = _metric_from_insights(insights, "saved")
        reach = _metric_from_insights(insights, "reach")
        impressions = _metric_from_insights(insights, "impressions") or _metric_from_insights(insights, "views") or reach
        total_interactions = _metric_from_insights(insights, "total_interactions")
        engagement = total_interactions or (likes + comments + shares + saves)
        metrics = {
            "impressions": impressions,
            "reach": reach,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "clicks": 0,
            "profile_visits": 0,
            "engagement_rate": round((engagement / max(reach, 1)) * 100, 2) if reach else 0,
        }
        metrics["top_signal"] = "gerou sinais reais do Instagram" if engagement else "ainda a acumular sinais reais"
        return {
            "metrics": metrics,
            "source": "instagram_media_insights",
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "media_id": media_id,
        }
    except Exception as e:
        logger.error(f"live metrics fetch error {media_id}: {e}")
        return None


async def refresh_social_live_metrics(uid: str, cid: Optional[str], limit: int = 12) -> dict:
    aid, sec = _cfg()
    conn = await _find_connection(uid, cid)
    conn = await _refresh_connection_runtime_state(uid, cid, aid, sec, conn, force=not _live_metrics_ready(conn))
    if not _live_metrics_ready(conn):
        reason = (conn or {}).get("insights_probe_detail") or {
            "permission_denied": "A Meta ainda não concedeu leitura de insights ao token desta ligação. Reconecte e aceite as permissões de analytics.",
            "no_data": "As permissões estão válidas, mas a Meta ainda não devolveu dados suficientes para trocar o relatório para real.",
            "expired": "O token Meta expirou. Reconecte a conta para renovar o acesso.",
        }.get(str((conn or {}).get("insights_status") or "").strip().lower(), "Meta insights ainda não estão validados para esta ligação.")
        return {"ready": False, "refreshed": 0, "reason": reason}
    posts = await db.social_posts.find({"user_id": uid, "company_id": cid}).sort("created_at", -1).to_list(limit)
    refreshed = 0
    for social_post_doc in posts:
        live_metrics = await _fetch_live_post_metrics(conn, social_post_doc)
        if not live_metrics:
            continue
        post_meta = await _marketing_post_meta(uid, cid, social_post_doc.get("post_id"))
        await record_marketing_metrics(uid, cid, social_post_doc, post_meta, live_metrics=live_metrics)
        refreshed += 1
    return {"ready": True, "refreshed": refreshed, "reason": None}


def _social_caption(post: dict) -> str:
    if not isinstance(post, dict):
        return ""
    return f"{post.get('legenda') or ''}\n\n{' '.join(post.get('hashtags') or [])}\n{post.get('cta') or ''}".strip()


def _next_social_slot(base: Optional[datetime] = None, offset: int = 0) -> str:
    anchor = base or datetime.now(timezone.utc)
    slot = anchor + timedelta(hours=1 + (offset * 6))
    minute = 0 if slot.minute < 30 else 30
    slot = slot.replace(minute=minute, second=0, microsecond=0)
    return slot.isoformat()


def _calendar_run_at(content: dict, post_id: str, offset: int = 0) -> str:
    now = datetime.now(timezone.utc)
    for item in (content.get("calendario") or []):
        if item.get("post_id") != post_id:
            continue
        try:
            day = datetime.fromisoformat(f"{item.get('data')}T10:00:00+00:00")
            if day > now:
                return day.isoformat()
        except Exception:
            continue
    return _next_social_slot(now, offset)


async def _social_media_agent_payload(uid: str, cid: Optional[str]):
    aid, sec = _cfg()
    conn = await _find_connection(uid, cid)
    social = _status_payload(conn, aid, sec)
    content_doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid}, {"_id": 0, "content.posts": 1, "content.calendario": 1}) or {}
    content = content_doc.get("content") or {}
    posts = content.get("posts") or []
    queued_rows = await db.social_jobs.find(
        {"user_id": uid, "company_id": cid, "status": {"$in": ["queued", "processing"]}},
        {"_id": 1, "payload.post_id": 1, "run_at": 1, "payload.autonomous_agent": 1, "created_at": 1},
    ).sort("run_at", 1).to_list(50)
    published_rows = await db.social_posts.find(
        {"user_id": uid, "company_id": cid},
        {"_id": 0, "post_id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(100)

    queued_post_ids = {((row.get("payload") or {}).get("post_id")) for row in queued_rows if (row.get("payload") or {}).get("post_id")}
    published_post_ids = {row.get("post_id") for row in published_rows if row.get("post_id")}
    approved_ready = [
        post for post in posts
        if post.get("status") == "approved" and post.get("id") not in queued_post_ids and post.get("id") not in published_post_ids
    ]
    autonomous_jobs = [row for row in queued_rows if (row.get("payload") or {}).get("autonomous_agent") == "social_media"]
    last_activity = None
    if queued_rows:
        last_activity = queued_rows[-1].get("created_at") or queued_rows[-1].get("run_at")
    elif published_rows:
        last_activity = published_rows[0].get("created_at")

    blockers = []
    if not social.get("connected"):
        if not social.get("configured"):
            blockers.append("A app Meta ainda não está configurada com credenciais reais.")
        elif social.get("connection_state") == "pending_selection":
            blockers.append("A ligação Meta foi autorizada, mas ainda falta escolher a Página certa.")
        else:
            blockers.append("Ligue primeiro o Facebook/Instagram da empresa ativa.")
    elif not social.get("publish_ready_facebook"):
        blockers.append("A Página Meta ligada ainda não tem tasks de publicação suficientes.")
    if not posts:
        blockers.append("Ainda não existem conteúdos editoriais para o Social Media Agent operar.")
    elif not approved_ready and not autonomous_jobs:
        blockers.append("Não há conteúdos aprovados e livres para agendamento automático neste momento.")

    return {
        "boundary": {
            "owns": [
                "calendário editorial",
                "legendas, formatos e imagem de publicação",
                "fila de agendamento e publicação automática",
                "analytics sociais e aprendizagem editorial",
            ],
            "never": [
                "site público",
                "SEO técnico",
                "GA4",
                "Google Search Console",
                "copy estrutural do website",
            ],
        },
        "summary": {
            "approved_ready": len(approved_ready),
            "queued": len(queued_rows),
            "autonomous_queue": len(autonomous_jobs),
            "published": len(published_rows),
            "channels_ready": bool(social.get("publish_ready_facebook") or social.get("publish_ready_instagram")),
            "metrics_mocked": bool(social.get("metrics_mocked", True)),
        },
        "status": {
            "configured": social.get("configured"),
            "connected": social.get("connected"),
            "connection_state": social.get("connection_state"),
            "page_name": social.get("page_name"),
            "ig_username": social.get("ig_username"),
            "last_activity_at": last_activity,
        },
        "blockers": blockers,
        "recent_queue": [
            {
                "id": str(row.get("_id")),
                "post_id": (row.get("payload") or {}).get("post_id"),
                "run_at": row.get("run_at"),
                "autonomous": (row.get("payload") or {}).get("autonomous_agent") == "social_media",
            }
            for row in queued_rows[:6]
        ],
    }


async def run_social_media_agent_cycle(uid: str, cid: Optional[str]):
    conn = await _find_connection(uid, cid)
    if not (_conn_ready(conn) and _has_publish_task((conn or {}).get("tasks") or [])):
        return await _social_media_agent_payload(uid, cid)

    content_doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid}) or {}
    content = content_doc.get("content") or {}
    posts = content.get("posts") or []
    if not posts:
        return await _social_media_agent_payload(uid, cid)

    queued_rows = await db.social_jobs.find(
        {"user_id": uid, "company_id": cid, "status": {"$in": ["queued", "processing"]}},
        {"_id": 0, "payload.post_id": 1},
    ).to_list(100)
    queued_post_ids = {((row.get("payload") or {}).get("post_id")) for row in queued_rows if (row.get("payload") or {}).get("post_id")}
    published_rows = await db.social_posts.find({"user_id": uid, "company_id": cid}, {"_id": 0, "post_id": 1}).to_list(200)
    published_post_ids = {row.get("post_id") for row in published_rows if row.get("post_id")}

    approved_ready = [
        post for post in posts
        if post.get("status") == "approved" and post.get("id") not in queued_post_ids and post.get("id") not in published_post_ids
    ]

    for offset, post in enumerate(approved_ready[:3]):
        payload = {
            "caption": _social_caption(post),
            "image_prompt": f"{post.get('titulo')}. {post.get('tema') or ''}",
            "generate_image": not bool(post.get("image_url")),
            "image_url": post.get("image_url") or None,
            "instagram": bool(conn.get("ig_user_id")),
            "facebook": True,
            "post_id": post.get("id"),
            "post_meta": {"title": post.get("titulo"), "theme": post.get("tema"), "format": post.get("formato")},
            "autonomous_agent": "social_media",
        }
        run_at = _calendar_run_at(content, post.get("id"), offset=offset)
        await db.social_jobs.insert_one({
            "_id": str(uuid.uuid4()),
            "user_id": uid,
            "company_id": cid,
            "payload": payload,
            "run_at": run_at,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await _sync_marketing_post(uid, cid, post.get("id"), "scheduled", scheduled_at=run_at)

    return await _social_media_agent_payload(uid, cid)


async def run_all_social_media_agent_cycles():
    rows = await db.marketing_content.find(
        {"content.posts": {"$elemMatch": {"status": "approved"}}},
        {"_id": 0, "user_id": 1, "company_id": 1},
    ).to_list(100)
    for row in rows:
        try:
            await run_social_media_agent_cycle(row.get("user_id"), row.get("company_id"))
        except Exception as e:
            logger.error(f"run_all_social_media_agent_cycles error {row}: {e}")


# ---------------------------------------------------------------- media pública (para o Instagram buscar a imagem)
async def _store_public_image(uid: str, cid: Optional[str], data: bytes, ct: str = "image/png") -> str:
    mid = str(uuid.uuid4())
    await db.social_media.insert_one({"_id": mid, "user_id": uid, "company_id": cid,
                                      "data": base64.b64encode(data).decode(), "content_type": ct,
                                      "created_at": datetime.now(timezone.utc).isoformat()})
    return f"{_base()}/api/public/media/{mid}"


@router.get("/public/media/{mid}")
async def public_media(mid: str):
    doc = await db.social_media.find_one({"_id": mid})
    if not doc:
        raise HTTPException(404, "não encontrado")
    raw_data = base64.b64decode(doc["data"])
    headers = {
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
    }
    return Response(content=raw_data, media_type=doc.get("content_type", "image/png"), headers=headers)


# ---------------------------------------------------------------- estado / ligação
@router.get("/social/status")
async def social_status(user: dict = Depends(premium_user)):
    await _ensure_meta_runtime_config()
    aid, sec = _cfg()
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    conn = await _refresh_connection_runtime_state(user["id"], cid, aid, sec, conn, force=False)
    return _status_payload(conn, aid, sec)


@router.get("/social/requirements")
async def social_requirements(user: dict = Depends(premium_user)):
    await _ensure_meta_runtime_config()
    aid, sec = _cfg()
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    payload = _status_payload(conn, aid, sec)
    payload["requirements"] = [
        "Página de Facebook ligada à empresa ativa",
        "Conta Instagram profissional (Business ou Creator) ligada à Página",
        "App Meta com redirect URI correto",
        "Permissões de publicação e leitura aprovadas na app",
    ]
    return payload


@router.post("/social/diagnostics")
async def social_diagnostics(user: dict = Depends(premium_user)):
    await _ensure_meta_runtime_config()
    aid, sec = _cfg()
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    conn = await _refresh_connection_runtime_state(user["id"], cid, aid, sec, conn, force=True)
    checks = ((conn or {}).get("last_diagnostics") or {}).get("checks") or _base_checks(aid, sec, conn)
    return _status_payload(conn, aid, sec, checks)


@router.get("/social/connect")
async def social_connect(user: dict = Depends(premium_user)):
    await _ensure_meta_runtime_config()
    aid, sec = _cfg()
    if not (aid and sec):
        raise HTTPException(400, "Integração Meta ainda não configurada (falta App ID/App Secret).")
    cid = await active_company_id(user["id"])
    state = secrets.token_urlsafe(24)
    await db.social_oauth_states.insert_one({
        "_id": state,
        "user_id": user["id"],
        "company_id": cid,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
    })
    q = {
        "client_id": aid,
        "redirect_uri": _redirect_uri(),
        "state": state,
        "response_type": "code",
        "auth_type": "rerequest",
    }
    if _meta_config_id():
        q["config_id"] = _meta_config_id()
        q["override_default_response_type"] = "true"
    else:
        q["scope"] = ",".join(SCOPES)
    return {"auth_url": f"https://www.facebook.com/{_graph_ver()}/dialog/oauth?{urlencode(q)}"}


@router.get("/social/callback")
async def social_callback(code: Optional[str] = None, state: Optional[str] = None,
                          error: Optional[str] = None, error_description: Optional[str] = None):
    base = _base()
    if error:
        return RedirectResponse(f"{base}/marketing?social_error={quote(error_description or error)}")
    st = await db.social_oauth_states.find_one_and_delete({"_id": state or "", "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not st or not code:
        return RedirectResponse(f"{base}/marketing?social_error=estado_invalido")
    uid = st["user_id"]
    cid = st.get("company_id") or await active_company_id(uid)
    aid, sec = _cfg()
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            short = (await client.get(_graph("oauth/access_token"), params={
                "client_id": aid, "client_secret": sec, "redirect_uri": _redirect_uri(), "code": code})).json()
            if "access_token" not in short:
                logger.error(f"social oauth short: {short}")
                return RedirectResponse(f"{base}/marketing?social_error=troca_codigo")
            user_short = short["access_token"]
            longt = (await client.get(_graph("oauth/access_token"), params={
                "grant_type": "fb_exchange_token", "client_id": aid, "client_secret": sec,
                "fb_exchange_token": user_short})).json()
            user_token = longt.get("access_token", user_short)
            pages = (await client.get(_graph("me/accounts"), params={
                "access_token": user_token, "appsecret_proof": _proof(user_token),
                "fields": "id,name,access_token,tasks,instagram_business_account"})).json()
        data = pages.get("data", [])
        if not data:
            return RedirectResponse(f"{base}/marketing?social_error=sem_pagina")
        token_debug = await _fetch_token_debug(user_token)
        if not token_debug.get("token_expires_at") and longt.get("expires_in"):
            token_debug["token_expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=int(longt.get("expires_in") or 0))).isoformat()
        candidates = []
        for page in data:
            candidates.append(await _hydrate_candidate(page))
        if len(candidates) == 1:
            await _finalize_connection(uid, cid, None, candidates[0], user_token, token_debug)
            fresh = await _find_connection(uid, cid)
            await _refresh_connection_runtime_state(uid, cid, aid, sec, fresh, force=True)
            return RedirectResponse(f"{base}/marketing?connected=1")
        await db.social_connections.update_one({"user_id": uid, "company_id": cid}, {"$set": {
            "user_id": uid,
            "company_id": cid,
            "status": "pending_selection",
            "meta_user_id": token_debug.get("meta_user_id"),
            "candidate_pages": candidates,
            "page_id": None,
            "page_name": None,
            "ig_user_id": None,
            "ig_username": None,
            "tasks": [],
            "page_token": None,
            "user_token": user_token,
            "granted_scopes": token_debug.get("granted_scopes") or [],
            "granular_scopes": token_debug.get("granular_scopes") or [],
            "token_expires_at": token_debug.get("token_expires_at"),
            "data_access_expires_at": token_debug.get("data_access_expires_at"),
            "insights_status": "unverified",
            "report_source": "mock",
            "insights_last_checked_at": None,
            "insights_probe_source": None,
            "insights_probe_detail": None,
            "last_diagnostics": {"checks": _base_checks(aid, sec, {"status": "pending_selection", "candidate_pages": candidates, "insights_status": "unverified", "report_source": "mock"})},
            "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
        return RedirectResponse(f"{base}/marketing?social_pending=1")
    except Exception as e:
        logger.error(f"social oauth callback: {e}")
        return RedirectResponse(f"{base}/marketing?social_error=falha_oauth")


class SelectPageIn(BaseModel):
    page_id: str


@router.post("/social/select-page")
async def social_select_page(inp: SelectPageIn, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    if not conn:
        raise HTTPException(400, "Não existe uma conexão Meta ativa ou pendente.")
    candidates = conn.get("candidate_pages") or []
    if not candidates:
        raise HTTPException(400, "Nenhuma página disponível para seleção na sessão atual.")
    chosen = next((item for item in candidates if item.get("page_id") == inp.page_id), None)
    if not chosen:
        raise HTTPException(404, "Página não encontrada na sessão Meta atual.")
    await _finalize_connection(user["id"], cid, conn, chosen, conn.get("user_token", ""), {
        "meta_user_id": conn.get("meta_user_id"),
        "granted_scopes": conn.get("granted_scopes") or [],
        "granular_scopes": conn.get("granular_scopes") or [],
        "token_expires_at": conn.get("token_expires_at"),
        "data_access_expires_at": conn.get("data_access_expires_at"),
    })
    fresh = await _find_connection(user["id"], cid)
    fresh = await _refresh_connection_runtime_state(user["id"], cid, *_cfg(), fresh, force=True)
    return {"ok": True, "connection": _status_payload(fresh, *_cfg())}


@router.post("/social/disconnect")
async def social_disconnect(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    await db.social_connections.delete_one({"user_id": user["id"], "company_id": cid})
    return {"ok": True}


class MetaAppConfigIn(BaseModel):
    app_id: str
    app_secret: str
    config_id: Optional[str] = None


@router.post("/social/config")
async def save_meta_app_config(inp: MetaAppConfigIn, user: dict = Depends(premium_user)):
    """Salva App ID e App Secret da Meta diretamente na base de dados."""
    _RUNTIME_META_CONFIG["app_id"] = inp.app_id.strip()
    _RUNTIME_META_CONFIG["app_secret"] = inp.app_secret.strip()
    if inp.config_id:
        _RUNTIME_META_CONFIG["config_id"] = inp.config_id.strip()
        
    await db.meta_app_config.update_one(
        {"type": "global"},
        {"$set": {
            "type": "global",
            "app_id": inp.app_id.strip(),
            "app_secret": inp.app_secret.strip(),
            "config_id": (inp.config_id or "").strip(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    return {"ok": True, "message": "Credenciais da Meta App guardadas com sucesso!"}


class ConnectDeveloperIn(BaseModel):
    access_token: str
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    config_id: Optional[str] = None
    page_id: Optional[str] = None
    ig_user_id: Optional[str] = None


@router.post("/social/connect-developer")
async def connect_developer(inp: ConnectDeveloperIn, user: dict = Depends(premium_user)):
    """Conecta diretamente Facebook & Instagram usando Token de Acesso do Meta for Developers / Graph API."""
    uid = user["id"]
    cid = await active_company_id(uid)
    token = inp.access_token.strip()
    
    if inp.app_id and inp.app_secret:
        _RUNTIME_META_CONFIG["app_id"] = inp.app_id.strip()
        _RUNTIME_META_CONFIG["app_secret"] = inp.app_secret.strip()
        if inp.config_id:
            _RUNTIME_META_CONFIG["config_id"] = inp.config_id.strip()
        await db.meta_app_config.update_one(
            {"type": "global"},
            {"$set": {
                "type": "global",
                "app_id": inp.app_id.strip(),
                "app_secret": inp.app_secret.strip(),
                "config_id": (inp.config_id or "").strip(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

    headers = {"User-Agent": "CEO-AI/2.0"}
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        aid, sec = _cfg()
        # Se temos App ID e Secret, tentar converter para Long-Lived Token (60 dias)
        # para que o me/accounts retorne o Token Permanente de Página (Never Expires)
        if aid and sec and token:
            try:
                ex_res = await client.get(
                    f"https://graph.facebook.com/{_graph_ver()}/oauth/access_token",
                    params={
                        "grant_type": "fb_exchange_token",
                        "client_id": aid,
                        "client_secret": sec,
                        "fb_exchange_token": token,
                    }
                )
                if ex_res.status_code == 200:
                    long_lived_token = ex_res.json().get("access_token")
                    if long_lived_token:
                        token = long_lived_token
                        logger.info("Token convertido com sucesso para Long-Lived Token!")
            except Exception as e:
                logger.warning(f"Tentativa de troca por long-lived token: {e}")

        page_info = None
        
        # 1. Tentar ler me?fields=id,name,instagram_business_account,tasks (se for Page Token)
        try:
            me_res = await client.get(
                f"https://graph.facebook.com/{_graph_ver()}/me",
                params={"access_token": token, "fields": "id,name,instagram_business_account,tasks"}
            )
            if me_res.status_code == 200:
                me_data = me_res.json()
                if "instagram_business_account" in me_data or "tasks" in me_data:
                    page_info = me_data
        except Exception:
            pass

        # 2. Se não for Page Token direto, tentar me/accounts (User Token / System User Token)
        candidate_pages = []
        if not page_info:
            try:
                acc_res = await client.get(
                    f"https://graph.facebook.com/{_graph_ver()}/me/accounts",
                    params={"access_token": token, "fields": "id,name,access_token,tasks,instagram_business_account"}
                )
                if acc_res.status_code == 200:
                    accounts_data = acc_res.json().get("data", [])
                    for acc in accounts_data:
                        candidate_pages.append(await _hydrate_candidate(acc))
            except Exception as e:
                logger.warning(f"Erro ao buscar me/accounts: {e}")

        chosen = None
        if candidate_pages:
            if inp.page_id:
                chosen = next((p for p in candidate_pages if p["page_id"] == inp.page_id), candidate_pages[0])
            else:
                chosen = candidate_pages[0]
        elif page_info:
            chosen = {
                "page_id": page_info.get("id"),
                "page_name": page_info.get("name", "Página Facebook"),
                "page_token": token,
                "tasks": page_info.get("tasks", ["CREATE_CONTENT", "MANAGE"]),
                "ig_user_id": ((page_info.get("instagram_business_account") or {}).get("id")) or inp.ig_user_id,
                "ig_username": None
            }
            if chosen["ig_user_id"]:
                try:
                    ig_res = await client.get(
                        f"https://graph.facebook.com/{_graph_ver()}/{chosen['ig_user_id']}",
                        params={"access_token": token, "fields": "username,name"}
                    )
                    if ig_res.status_code == 200:
                        chosen["ig_username"] = ig_res.json().get("username")
                except Exception:
                    pass
        else:
            # Fallback manual com dados fornecidos
            chosen = {
                "page_id": inp.page_id or "meta_page",
                "page_name": "Página Conectada via Token",
                "page_token": token,
                "tasks": ["CREATE_CONTENT", "MANAGE"],
                "ig_user_id": inp.ig_user_id,
                "ig_username": None
            }
            if inp.ig_user_id:
                try:
                    ig_res = await client.get(
                        f"https://graph.facebook.com/{_graph_ver()}/{inp.ig_user_id}",
                        params={"access_token": token, "fields": "username,name"}
                    )
                    if ig_res.status_code == 200:
                        chosen["ig_username"] = ig_res.json().get("username")
                except Exception:
                    pass

        if not chosen or (not chosen.get("page_id") and not chosen.get("ig_user_id") and not token):
            raise HTTPException(400, "Token Meta inválido. Verifique se o token tem permissões instagram_content_publish e pages_manage_posts.")

        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "user_id": uid,
            "company_id": cid,
            "status": "connected",
            "page_id": chosen.get("page_id"),
            "page_name": chosen.get("page_name"),
            "page_token": chosen.get("page_token") or token,
            "ig_user_id": chosen.get("ig_user_id"),
            "ig_username": chosen.get("ig_username"),
            "tasks": chosen.get("tasks") or ["CREATE_CONTENT", "MANAGE"],
            "user_token": token,
            "granted_scopes": [
                "instagram_basic", "instagram_content_publish", "instagram_manage_insights",
                "pages_show_list", "pages_read_engagement", "pages_manage_posts"
            ],
            "insights_status": "ready" if chosen.get("ig_user_id") else "unavailable",
            "report_source": "real" if chosen.get("ig_user_id") else "mock",
            "updated_at": now_iso
        }
        await db.social_connections.update_one(
            {"user_id": uid, "company_id": cid},
            {"$set": doc},
            upsert=True
        )
        
        conn = await _find_connection(uid, cid)
        aid, sec = _cfg()
        return {
            "ok": True,
            "message": f"Conectado com sucesso à Página '{chosen.get('page_name')}' e Instagram @{chosen.get('ig_username') or 'Business'}!",
            "connection": _status_payload(conn, aid, sec)
        }


# ---------------------------------------------------------------- publicação
class PublishIn(BaseModel):
    caption: str = ""
    image_prompt: Optional[str] = None
    generate_image: bool = True
    image_url: Optional[str] = None
    post_id: Optional[str] = None
    instagram: bool = True
    facebook: bool = True


class ScheduleIn(PublishIn):
    run_at: str                             # ISO 8601 UTC


async def _await_ig_container(container_id: str, token: str):
    for attempt in range(15):
        try:
            status = await _graph_req("GET", _graph(container_id), {"fields": "status_code,status"}, token)
            code = (status.get("status_code") or "").upper()
            if code in {"FINISHED", "PUBLISHED"}:
                return status
            if code in {"ERROR", "EXPIRED"}:
                err_detail = status.get("status") or code
                raise HTTPException(502, f"A Meta devolveu erro ao processar o media do Instagram ({code}): {err_detail}")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Tentativa {attempt+1} _await_ig_container: {e}")
        await asyncio.sleep(2.0)
    raise HTTPException(502, "A Meta ainda está a processar o media do Instagram. Tente novamente dentro de alguns instantes.")


async def _publish_core(uid: str, cid: Optional[str], payload: dict) -> dict:
    conn = await _find_connection(uid, cid)
    if not _conn_ready(conn):
        if _conn_state(conn) == "pending_selection":
            raise HTTPException(400, "A ligação Meta foi autorizada, mas ainda falta escolher a Página certa.")
        raise HTTPException(400, "As redes ainda não estão ligadas.")
    caption = payload.get("caption") or ""
    image_url = payload.get("image_url")
    want_img = payload.get("generate_image", True)
    do_ig = payload.get("instagram", True)
    do_fb = payload.get("facebook", True)
    if not (do_ig or do_fb):
        raise HTTPException(400, "Escolha pelo menos um canal de publicação.")
    if not _has_publish_task((conn or {}).get("tasks") or []):
        raise HTTPException(400, "A Página Meta ligada não tem as permissões necessárias para publicar (CREATE_CONTENT/MANAGE).")
    post_id = payload.get("post_id")
    post_meta = payload.get("post_meta") or await _marketing_post_meta(uid, cid, post_id)

    # Obter os bytes reais da imagem para servir à Meta via CDN público direto
    img_bytes = None
    if image_url:
        img_str = str(image_url)
        if "/uploads/" in img_str:
            fname = img_str.split("/uploads/")[-1].split("?")[0]
            fpath = UPLOAD_DIR / fname
            if fpath.exists():
                try:
                    img_bytes = fpath.read_bytes()
                except Exception:
                    pass
            if not img_bytes:
                doc = await db.uploaded_files.find_one({"filename": fname})
                if doc and doc.get("data"):
                    try:
                        img_bytes = base64.b64decode(doc["data"])
                        try:
                            fpath.write_bytes(img_bytes)
                        except Exception:
                            pass
                    except Exception:
                        pass
            if not img_bytes:
                doc_sm = await db.social_media.find_one({"_id": fname})
                if doc_sm and doc_sm.get("data"):
                    try:
                        img_bytes = base64.b64decode(doc_sm["data"])
                    except Exception:
                        pass
        elif img_str.startswith("http") and "/api/public/media/" not in img_str:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    r = await client.get(img_str)
                    if r.status_code == 200 and len(r.content) > 500:
                        img_bytes = r.content
            except Exception as e:
                logger.warning(f"Erro ao descarregar imagem remota: {e}")

    # Se não temos imagem mas o canal exige imagem (Instagram), gerar de forma segura
    if not img_bytes and (do_ig or want_img):
        try:
            prompt = payload.get("image_prompt") or caption[:220] or "Professional business commercial marketing"
            img_bytes = await asyncio.wait_for(generate_marketing_image(prompt), timeout=10.0)
        except Exception as e:
            logger.warning(f"Fallback de imagem rápida para publicação: {e}")
            from PIL import Image, ImageDraw
            buf = io.BytesIO()
            bg_img = Image.new("RGB", (1080, 1080), (15, 23, 42))
            draw = ImageDraw.Draw(bg_img)
            draw.rectangle([60, 60, 1020, 1020], outline=(59, 130, 246), width=6)
            bg_img.save(buf, format="PNG")
            img_bytes = buf.getvalue()

    if img_bytes:
        logo = await db.brand_assets.find_one({"user_id": uid, "company_id": cid})
        if logo and logo.get("logo_data"):
            try:
                img_bytes = composite_logo(img_bytes, base64.b64decode(logo["logo_data"]))
            except Exception as e:
                logger.error(f"logo composite falhou: {e}")
        image_url = await _store_public_image(uid, cid, img_bytes)

    results = {}
    if do_ig:
        ig = conn.get("ig_user_id")
        if not ig:
            results["instagram"] = {"error": "Sem conta Instagram profissional ligada à Página."}
        elif not image_url:
            results["instagram"] = {"error": "O Instagram exige uma imagem."}
        else:
            token = conn.get("user_token") or conn["page_token"]
            try:
                cont = await _graph_req("POST", _graph(f"{ig}/media"), {"image_url": image_url, "caption": caption}, token)
                await _await_ig_container(cont["id"], token)
                pub = await _graph_req("POST", _graph(f"{ig}/media_publish"), {"creation_id": cont["id"]}, token)
                results["instagram"] = {"ok": True, "id": pub.get("id")}
            except Exception as e:
                logger.error(f"Erro ao publicar no Instagram: {e}")
                results["instagram"] = {"error": str(e)}

    if do_fb:
        pid = conn["page_id"]
        token = conn["page_token"]
        try:
            if image_url:
                fb = await _graph_req("POST", _graph(f"{pid}/photos"), {"url": image_url, "caption": caption}, token)
            else:
                fb = await _graph_req("POST", _graph(f"{pid}/feed"), {"message": caption}, token)
            results["facebook"] = {"ok": True, "id": fb.get("id") or fb.get("post_id")}
        except Exception as e:
            logger.error(f"Erro ao publicar no Facebook: {e}")
            results["facebook"] = {"error": str(e)}

    now_iso = datetime.now(timezone.utc).isoformat()
    social_post_doc = {
        "_id": str(uuid.uuid4()),
        "user_id": uid,
        "company_id": cid,
        "post_id": post_id,
        "post_title": post_meta.get("titulo"),
        "theme": post_meta.get("tema"),
        "format": post_meta.get("formato"),
        "caption": caption,
        "image_url": image_url,
        "results": results,
        "created_at": now_iso,
    }
    await db.social_posts.insert_one(social_post_doc)
    live_metrics = await _fetch_live_post_metrics(conn, social_post_doc)
    await record_marketing_metrics(uid, cid, social_post_doc, post_meta, live_metrics=live_metrics)
    if post_id:
        await _sync_marketing_post(uid, cid, post_id, "approved", published_at=now_iso)
    return results


@router.post("/social/publish")
async def social_publish(inp: PublishIn, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    res = await _publish_core(user["id"], cid, inp.model_dump())
    return {"ok": True, "results": res}


@router.post("/social/schedule")
async def social_schedule(inp: ScheduleIn, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    if not _conn_ready(conn):
        if _conn_state(conn) == "pending_selection":
            raise HTTPException(400, "Escolha primeiro a Página Meta a ligar a esta empresa.")
        raise HTTPException(400, "As redes ainda não estão ligadas.")
    d = inp.model_dump(); run_at = d.pop("run_at")
    if d.get("post_id"):
        d["post_meta"] = await _marketing_post_meta(user["id"], cid, d.get("post_id"))
    job = {"_id": str(uuid.uuid4()), "user_id": user["id"], "company_id": cid, "payload": d, "run_at": run_at,
           "status": "queued", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.social_jobs.insert_one(job)
    if d.get("post_id"):
        await _sync_marketing_post(user["id"], cid, d.get("post_id"), "scheduled", scheduled_at=run_at)
    return {"ok": True, "id": job["_id"]}


@router.get("/social/jobs")
async def social_jobs(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    await _migrate_legacy_jobs(user["id"], cid)
    jobs = await db.social_jobs.find({"user_id": user["id"], "company_id": cid}).sort("run_at", 1).to_list(100)
    out = []
    for j in jobs:
        payload = j.get("payload") or {}
        out.append({
            "id": str(j["_id"]),
            "run_at": j.get("run_at") or j.get("scheduled_at"),
            "status": j.get("status", "queued"),
            "title": j.get("title") or payload.get("title") or "Publicação Programada",
            "caption": j.get("caption") or payload.get("caption") or "",
            "image_url": j.get("image_url") or payload.get("image_url"),
            "platforms": j.get("platforms") or (["instagram"] if payload.get("instagram") else []) + (["facebook"] if payload.get("facebook") else []),
            "post_id": j.get("post_id") or j.get("content_id") or payload.get("post_id"),
            "error": j.get("error"),
            "result": j.get("result"),
            "published_at": j.get("published_at"),
            "created_at": j.get("created_at"),
        })
    return {"jobs": out}


@router.post("/social/jobs/{jid}/publish-now")
async def publish_job_now(jid: str, user: dict = Depends(premium_user)):
    """Publica imediatamente um post agendado sem esperar pela hora programada."""
    cid = await active_company_id(user["id"])
    job = await db.social_jobs.find_one({"_id": jid, "user_id": user["id"], "company_id": cid})
    if not job:
        # Tentar converter para ObjectId se necessário
        from bson import ObjectId
        try:
            job = await db.social_jobs.find_one({"_id": ObjectId(jid), "user_id": user["id"], "company_id": cid})
        except Exception:
            pass
    if not job:
        raise HTTPException(404, "Agendamento não encontrado.")
    
    payload = job.get("payload") or {}
    if not payload:
        payload = {
            "caption": job.get("caption") or job.get("title") or "",
            "image_url": job.get("image_url"),
            "post_id": job.get("post_id") or job.get("content_id"),
            "instagram": "instagram" in [p.lower() for p in (job.get("platforms") or ["instagram", "facebook"])],
            "facebook": "facebook" in [p.lower() for p in (job.get("platforms") or ["instagram", "facebook"])],
        }
    
    if payload.get("image_url") and payload["image_url"].startswith("/"):
        payload["image_url"] = f"{_base()}{payload['image_url']}"
        
    res = await _publish_core(user["id"], cid, payload)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.social_jobs.update_one(
        {"_id": job["_id"]},
        {"$set": {"status": "published", "result": res, "published_at": now_iso}}
    )
    return {"ok": True, "message": "Publicação disparada com sucesso!", "results": res}


class UpdateJobIn(BaseModel):
    caption: Optional[str] = None
    image_url: Optional[str] = None
    run_at: Optional[str] = None
    title: Optional[str] = None


@router.put("/social/jobs/{jid}")
async def update_job(jid: str, inp: UpdateJobIn, user: dict = Depends(premium_user)):
    """Permite editar a legenda, imagem, título ou horário de um agendamento."""
    cid = await active_company_id(user["id"])
    job = await db.social_jobs.find_one({"_id": jid, "user_id": user["id"], "company_id": cid})
    if not job:
        from bson import ObjectId
        try:
            job = await db.social_jobs.find_one({"_id": ObjectId(jid), "user_id": user["id"], "company_id": cid})
        except Exception:
            pass
    if not job:
        raise HTTPException(404, "Agendamento não encontrado.")
    
    upd = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if inp.caption is not None:
        upd["caption"] = inp.caption
        if "payload" in job and isinstance(job["payload"], dict):
            upd["payload.caption"] = inp.caption
    if inp.image_url is not None:
        upd["image_url"] = inp.image_url
        if "payload" in job and isinstance(job["payload"], dict):
            upd["payload.image_url"] = inp.image_url
    if inp.title is not None:
        upd["title"] = inp.title
        if "payload" in job and isinstance(job["payload"], dict):
            upd["payload.title"] = inp.title
    if inp.run_at is not None:
        upd["run_at"] = inp.run_at
        
    await db.social_jobs.update_one({"_id": job["_id"]}, {"$set": upd})
    return {"ok": True, "message": "Agendamento atualizado com sucesso!"}


@router.get("/social/published-history")
async def get_published_history(user: dict = Depends(premium_user)):
    """Retorna o histórico completo de publicações realizadas com imagens e links."""
    cid = await active_company_id(user["id"])
    posts = await db.social_posts.find({"user_id": user["id"], "company_id": cid}).sort("created_at", -1).to_list(50)
    out = []
    for p in posts:
        out.append({
            "id": str(p["_id"]),
            "post_title": p.get("post_title") or "Publicação",
            "caption": p.get("caption") or "",
            "image_url": p.get("image_url"),
            "format": p.get("format") or "Post",
            "theme": p.get("theme"),
            "results": p.get("results") or {},
            "created_at": p.get("created_at"),
            "metrics": p.get("metrics") or {},
        })
    return {"posts": out}


@router.get("/social/accounts")
async def get_available_accounts(user: dict = Depends(premium_user)):
    """Lista todas as Páginas e contas de Instagram disponíveis no Token Meta ativo."""
    cid = await active_company_id(user["id"])
    conn = await _find_connection(user["id"], cid)
    if not conn or not (conn.get("user_token") or conn.get("page_token")):
        return {"pages": [], "active_page": None}
    
    token = conn.get("user_token") or conn.get("page_token")
    pages = []
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.get(
                f"https://graph.facebook.com/{_graph_ver()}/me/accounts",
                params={"access_token": token, "fields": "id,name,access_token,tasks,instagram_business_account"}
            )
            if r.status_code == 200:
                data = r.json().get("data", [])
                for p in data:
                    item = {
                        "page_id": p.get("id"),
                        "page_name": p.get("name"),
                        "ig_user_id": (p.get("instagram_business_account") or {}).get("id"),
                        "ig_username": None
                    }
                    if item["ig_user_id"]:
                        try:
                            ig_r = await client.get(
                                f"https://graph.facebook.com/{_graph_ver()}/{item['ig_user_id']}",
                                params={"access_token": p.get("access_token") or token, "fields": "username,name"}
                            )
                            if ig_r.status_code == 200:
                                item["ig_username"] = ig_r.json().get("username")
                        except Exception:
                            pass
                    pages.append(item)
        except Exception as e:
            logger.warning(f"Erro ao listar me/accounts: {e}")
            
    return {
        "pages": pages,
        "active_page_id": conn.get("page_id"),
        "active_page_name": conn.get("page_name"),
        "active_ig_username": conn.get("ig_username")
    }


@router.get("/social/media-agent")
async def social_media_agent_status(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    return await _social_media_agent_payload(user["id"], cid)


@router.post("/social/media-agent/run")
async def social_media_agent_run(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    return await run_social_media_agent_cycle(user["id"], cid)


@router.post("/social/metrics/refresh")
async def social_metrics_refresh(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    return await refresh_social_live_metrics(user["id"], cid)


@router.delete("/social/jobs/{jid}")
async def del_job(jid: str, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    job = await db.social_jobs.find_one({"_id": jid, "user_id": user["id"], "company_id": cid})
    if not job:
        from bson import ObjectId
        try:
            job = await db.social_jobs.find_one({"_id": ObjectId(jid), "user_id": user["id"], "company_id": cid})
        except Exception:
            pass
    if job:
        await db.social_jobs.delete_one({"_id": job["_id"]})
        post_id = ((job or {}).get("payload") or {}).get("post_id") or job.get("post_id")
        if post_id:
            await _sync_marketing_post(user["id"], cid, post_id, "approved")
    return {"ok": True}


class RescheduleIn(BaseModel):
    run_at: str


@router.post("/social/jobs/{jid}/reschedule")
async def reschedule_job(jid: str, inp: RescheduleIn, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    job = await db.social_jobs.find_one({"_id": jid, "user_id": user["id"], "company_id": cid})
    if not job:
        from bson import ObjectId
        try:
            job = await db.social_jobs.find_one({"_id": ObjectId(jid), "user_id": user["id"], "company_id": cid})
        except Exception:
            pass
    if not job:
        raise HTTPException(404, "Agendamento não encontrado.")
    await db.social_jobs.update_one(
        {"_id": job["_id"]},
        {"$set": {"run_at": inp.run_at, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "id": str(job["_id"]), "run_at": inp.run_at}


# ---------------------------------------------------------------- logo da empresa (sobreposto nas imagens)
@router.get("/social/logo")
async def get_logo(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    doc = await db.brand_assets.find_one({"user_id": user["id"], "company_id": cid})
    if not doc or not doc.get("logo_data"):
        return {"has_logo": False}
    return {"has_logo": True, "preview": f"data:{doc.get('content_type', 'image/png')};base64,{doc['logo_data']}"}


@router.post("/social/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(premium_user)):
    ct = file.content_type or ""
    if not ct.startswith("image/"):
        raise HTTPException(400, "Envie um ficheiro de imagem (PNG de preferência, com fundo transparente).")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Logo demasiado grande (máx 5 MB).")
    try:
        data = prepare_logo(data); ct = "image/png"
    except Exception as e:
        logger.error(f"prepare_logo: {e}")
    b64 = base64.b64encode(data).decode()
    cid = await active_company_id(user["id"])
    await db.brand_assets.update_one({"user_id": user["id"], "company_id": cid}, {"$set": {
        "user_id": user["id"], "company_id": cid, "logo_data": b64, "content_type": ct,
        "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True, "preview": f"data:{ct};base64,{b64}"}


@router.delete("/social/logo")
async def delete_logo(user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    await db.brand_assets.delete_one({"user_id": user["id"], "company_id": cid})
    return {"ok": True}


# ---------------------------------------------------------------- worker de agendamento
async def run_due_social_jobs():
    now = datetime.now(timezone.utc)
    async for job in db.social_jobs.find({"status": {"$in": ["queued", "QUEUED"]}}):
        try:
            ra_str = job.get("run_at") or job.get("scheduled_at")
            if not ra_str:
                continue
            ra = datetime.fromisoformat(str(ra_str).replace("Z", "+00:00"))
            if ra.tzinfo is None:
                ra = ra.replace(tzinfo=timezone.utc)
            if ra > now:
                continue
            claimed = await db.social_jobs.find_one_and_update(
                {"_id": job["_id"], "status": {"$in": ["queued", "QUEUED"]}},
                {"$set": {"status": "processing"}}
            )
            if not claimed:
                continue
            cid = job.get("company_id") or await active_company_id(job["user_id"])
            
            payload = job.get("payload") or {}
            if not payload:
                payload = {
                    "caption": job.get("caption") or job.get("title") or "",
                    "image_url": job.get("image_url"),
                    "post_id": job.get("post_id") or job.get("content_id"),
                    "instagram": "instagram" in [p.lower() for p in (job.get("platforms") or ["instagram", "facebook"])],
                    "facebook": "facebook" in [p.lower() for p in (job.get("platforms") or ["instagram", "facebook"])],
                }
            
            if payload.get("image_url") and payload["image_url"].startswith("/"):
                payload["image_url"] = f"{_base()}{payload['image_url']}"
            
            res = await _publish_core(job["user_id"], cid, payload)
            published_at = datetime.now(timezone.utc).isoformat()
            await db.social_jobs.update_one({"_id": job["_id"]}, {"$set": {
                "status": "published", "result": res, "published_at": published_at}})
            post_id = payload.get("post_id")
            if post_id:
                await _sync_marketing_post(job["user_id"], cid, post_id, "scheduled", scheduled_at=job.get("run_at"), published_at=published_at)
        except Exception as e:
            await db.social_jobs.update_one({"_id": job["_id"]}, {"$set": {
                "status": "failed", "error": str(getattr(e, "detail", e))[:500]}})
