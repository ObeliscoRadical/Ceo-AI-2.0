import hashlib
import json
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from core import (
    active_company_id,
    db,
    get_current_user,
    get_erp_financial_context,
    invalidate_ai_cache,
    resolve_company,
)
from models import ERPIntegrationInput

router = APIRouter()

AUTH_MODES = {"header", "bearer", "query"}
SCALAR_ALIASES = {
    "cash_balance": ["cash_balance", "current_balance", "balance", "saldo_atual", "saldo", "cashBalance", "available_balance"],
    "total_debt": ["total_debt", "debt", "debts_total", "divida_total", "loan_balance", "financing_balance", "totalDebt"],
    "monthly_revenue": ["monthly_revenue", "revenue_monthly", "faturacao_mensal", "monthlyRevenue", "mrr", "receita_mensal"],
    "variable_costs_pct": ["variable_costs_pct", "variable_cost_percent", "custos_variaveis_pct", "variableCostsPct", "variable_cost_rate"],
}
LIST_ALIASES = {
    "fixed_costs": ["fixed_costs", "custos_fixos", "fixedCosts", "monthly_costs_fixed"],
    "assets": ["assets", "ativos", "balance_assets"],
    "liabilities": ["liabilities", "passivos", "balance_liabilities"],
}
OBJECT_ALIASES = {
    "credit_restructuring": ["credit_restructuring", "reestruturacao_credito", "creditRestructuring", "debt_restructuring"],
}
EVENT_KEY_ALIASES = ["event_id", "id", "reference", "event_reference", "message_id"]
EVENT_TYPE_ALIASES = ["event_type", "type", "topic", "kind"]
OCCURRED_AT_ALIASES = ["occurred_at", "timestamp", "sent_at", "created_at", "event_time"]
NESTED_BLOCK_KEYS = [
    "data", "payload", "body", "snapshot", "financial", "finance", "context",
    "metrics", "company", "company_data", "summary", "balances", "erp", "erp_data",
]


def _mask_secret(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 8:
        return "•" * len(raw)
    return f"{raw[:4]}{'•' * max(4, len(raw) - 8)}{raw[-4:]}"


def _public_api_base(request: Request) -> str:
    origin = (request.headers.get("origin") or os.environ.get("FRONTEND_URL") or "").rstrip("/")
    if origin.startswith("http"):
        return origin
    return str(request.base_url).rstrip("/")


def _to_number(value):
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    if isinstance(value, str):
        raw = value.strip().replace("€", "").replace("R$", "").replace("$", "").replace(" ", "")
        if not raw:
            return None
        if raw.count(",") == 1 and raw.count(".") > 1:
            raw = raw.replace(".", "").replace(",", ".")
        elif raw.count(",") == 1 and raw.count(".") == 0:
            raw = raw.replace(",", ".")
        try:
            return round(float(raw), 2)
        except Exception:
            return None
    return None


def _pick(payload: dict, *keys):
    for key in keys:
        if key in payload and payload.get(key) not in (None, "", []):
            return payload.get(key)
    return None


def _iter_candidate_dicts(payload: dict):
    out = [("root", payload)]
    seen = {id(payload)}
    queue = [("root", payload, 0)]
    while queue:
        path, node, depth = queue.pop(0)
        if depth >= 3:
            continue
        for key, value in (node or {}).items():
            if isinstance(value, dict) and id(value) not in seen:
                child_path = f"{path}.{key}"
                seen.add(id(value))
                out.append((child_path, value))
                if depth == 0 or key in NESTED_BLOCK_KEYS:
                    queue.append((child_path, value, depth + 1))
    return out


def _first_match(dicts, aliases):
    for path, node in dicts:
        for key in aliases:
            if key in node:
                return True, node.get(key), path, key
    return False, None, None, None


def _normalize_items(value, fallback_name: str):
    out = []
    if isinstance(value, dict):
        if isinstance(value.get("items"), list):
            value = value.get("items")
        else:
            value = [{"name": k, "amount": v} for k, v in value.items()]
    if not isinstance(value, list):
        return out
    for idx, item in enumerate(value):
        if isinstance(item, dict):
            amount = _to_number(item.get("amount") if "amount" in item else item.get("value") if "value" in item else item.get("total"))
            name = str(item.get("name") or item.get("label") or item.get("description") or f"{fallback_name} {idx + 1}").strip()
        else:
            amount = _to_number(item)
            name = f"{fallback_name} {idx + 1}"
        if amount is None:
            continue
        out.append({"name": name, "amount": amount})
    return out


def _normalize_financial_payload(payload: dict):
    dicts = _iter_candidate_dicts(payload)
    updates = {}
    detected = {}
    present_fields = []
    for field, aliases in SCALAR_ALIASES.items():
        present, raw, path, key = _first_match(dicts, aliases)
        if present:
            updates[field] = _to_number(raw)
            detected[field] = {"path": path, "alias": key}
            present_fields.append(field)
    for field, aliases in LIST_ALIASES.items():
        present, raw, path, key = _first_match(dicts, aliases)
        if present:
            label = "Custo fixo" if field == "fixed_costs" else "Ativo" if field == "assets" else "Passivo"
            updates[field] = _normalize_items(raw, label)
            detected[field] = {"path": path, "alias": key}
            present_fields.append(field)
    for field, aliases in OBJECT_ALIASES.items():
        present, raw, path, key = _first_match(dicts, aliases)
        if present:
            updates[field] = raw if isinstance(raw, dict) else {"value": raw}
            detected[field] = {"path": path, "alias": key}
            present_fields.append(field)
    _, event_value, _, _ = _first_match(dicts, EVENT_KEY_ALIASES)
    _, event_type_value, _, _ = _first_match(dicts, EVENT_TYPE_ALIASES)
    _, occurred_at_value, _, _ = _first_match(dicts, OCCURRED_AT_ALIASES)
    meaningful = bool(present_fields)
    event_key = str(event_value or hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()[:24])
    event_type = str(event_type_value or "financial_update")
    occurred_at = str(occurred_at_value or datetime.now(timezone.utc).isoformat())
    return {
        "meaningful": meaningful,
        "present_fields": present_fields,
        "detected": detected,
        "event_key": event_key,
        "event_type": event_type,
        "occurred_at": occurred_at,
        "context": updates,
    }


def _extract_inbound_token(conn: dict, request: Request):
    auth_mode = (conn.get("auth_mode") or "header").strip().lower()
    header_name = conn.get("auth_header_name") or "X-ERP-Token"
    query_name = conn.get("auth_query_name") or "token"
    auth_prefix = (conn.get("auth_prefix") or "Bearer").strip()
    if auth_mode == "query":
        token = request.query_params.get(query_name)
        if not token:
            raise HTTPException(status_code=401, detail=f"Falta o parâmetro de query {query_name}")
        return token
    if auth_mode == "bearer":
        auth = request.headers.get("Authorization", "")
        if auth_prefix:
            prefix = f"{auth_prefix} "
            if not auth.startswith(prefix):
                raise HTTPException(status_code=401, detail="Falta o Authorization Bearer")
            return auth[len(prefix):].strip()
        if not auth:
            raise HTTPException(status_code=401, detail="Falta o cabeçalho Authorization")
        return auth.strip()
    token = request.headers.get(header_name) or request.query_params.get(query_name)
    if not token:
        raise HTTPException(status_code=401, detail=f"Falta o cabeçalho {header_name}")
    return token


@router.get("/erp-integration/contract")
async def erp_integration_contract():
    return {
        "auth_modes": [
            {"code": "header", "label": "Cabeçalho customizado", "example": {"X-ERP-Token": "<token>"}},
            {"code": "bearer", "label": "Authorization Bearer", "example": {"Authorization": "Bearer <token>"}},
            {"code": "query", "label": "Query param", "example": {"url": "...?token=<token>"}},
        ],
        "canonical_fields": {
            "cash_balance": "saldo atual",
            "total_debt": "dívida total",
            "monthly_revenue": "faturação mensal",
            "variable_costs_pct": "custos variáveis em percentagem",
            "fixed_costs": [{"name": "Renda", "amount": 3200}],
            "assets": [{"name": "Stock", "amount": 15000}],
            "liabilities": [{"name": "Fornecedores", "amount": 9000}],
            "credit_restructuring": {"status": "em negociação", "monthly_payment": 650},
        },
        "accepted_aliases": {**SCALAR_ALIASES, **LIST_ALIASES, **OBJECT_ALIASES},
        "supports": {
            "partial_updates": True,
            "nested_payloads": True,
            "flat_payloads": True,
            "arrays_or_key_value_objects": True,
            "idempotency_by_event_id": True,
        },
        "examples": {
            "flat": {
                "event_id": "fin-2026-0001",
                "cash_balance": 45200,
                "total_debt": 18000,
                "monthly_revenue": 37000,
                "fixed_costs": [{"name": "Renda", "amount": 3200}],
            },
            "nested": {
                "type": "finance.snapshot",
                "data": {
                    "company": {"name": "Cliente X"},
                    "snapshot": {
                        "balance": 45200,
                        "divida_total": 18000,
                        "custos_fixos": {"Renda": 3200, "Salários": 9800},
                    },
                },
            },
        },
    }


@router.get("/erp-integration/status")
async def erp_integration_status(request: Request, user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    company = await resolve_company(user["id"]) or {}
    if not cid:
        return {"connected": False, "company": None, "connection": None, "context": None, "recent_events": []}
    conn = await db.erp_integrations.find_one({"user_id": user["id"], "company_id": cid, "active": True}, {"_id": 0, "token_hash": 0})
    ctx = await get_erp_financial_context(user["id"], cid)
    events = await db.erp_events.find({"user_id": user["id"], "company_id": cid}, {"_id": 0, "raw_payload": 0}).sort("received_at", -1).to_list(5)
    webhook_url = None
    if conn:
        webhook_url = f"{_public_api_base(request)}/api/erp-integration/inbound/{conn['endpoint_id']}"
        conn = {**conn, "webhook_url": webhook_url}
    if ctx:
        ctx = {**ctx, "total_fixed_costs": round(sum(float(c.get("amount", 0) or 0) for c in (ctx.get("fixed_costs") or [])), 2)}
    return {
        "connected": bool(conn),
        "company": {"id": cid, "name": company.get("name", "A minha empresa")},
        "connection": conn,
        "context": ctx,
        "recent_events": events,
    }


@router.post("/erp-integration/connect")
async def erp_integration_connect(inp: ERPIntegrationInput, request: Request, user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    if not cid:
        raise HTTPException(status_code=400, detail="Cria ou seleciona uma empresa antes de integrar o teu sistema de gestão.")
    existing = await db.erp_integrations.find_one({"user_id": user["id"], "company_id": cid}) or {}
    endpoint_id = existing.get("endpoint_id") or secrets.token_urlsafe(18)
    raw_token = (inp.api_token or "").strip()
    generated = False
    if inp.generate_token or (not raw_token and not existing.get("token_hash")):
        raw_token = secrets.token_urlsafe(24)
        generated = True
    if not raw_token and not existing.get("token_hash"):
        raise HTTPException(status_code=400, detail="Indica um token seguro ou pede ao CEO AI 2.0 para gerar um.")
    auth_mode = (inp.auth_mode or existing.get("auth_mode") or "header").strip().lower()
    if auth_mode not in AUTH_MODES:
        raise HTTPException(status_code=400, detail="Modo de autenticação inválido")
    auth_header_name = (inp.auth_header_name or existing.get("auth_header_name") or "X-ERP-Token").strip() or "X-ERP-Token"
    auth_query_name = (inp.auth_query_name or existing.get("auth_query_name") or "token").strip() or "token"
    auth_prefix = inp.auth_prefix if inp.auth_prefix is not None else existing.get("auth_prefix")
    auth_prefix = (auth_prefix or ("Bearer" if auth_mode == "bearer" else "")).strip()
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest() if raw_token else existing.get("token_hash")
    token_mask = _mask_secret(raw_token) if raw_token else existing.get("token_mask", "")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user["id"],
        "company_id": cid,
        "system_name": (inp.system_name or existing.get("system_name") or "Sistema de Gestão").strip() or "Sistema de Gestão",
        "erp_base_url": (inp.erp_base_url or existing.get("erp_base_url") or "").strip(),
        "external_webhook_url": (inp.external_webhook_url or existing.get("external_webhook_url") or "").strip(),
        "auth_mode": auth_mode,
        "auth_header_name": auth_header_name,
        "auth_query_name": auth_query_name,
        "auth_prefix": auth_prefix,
        "token_hash": token_hash,
        "token_mask": token_mask,
        "notes": (inp.notes or existing.get("notes") or "").strip(),
        "endpoint_id": endpoint_id,
        "active": True,
        "updated_at": now,
    }
    await db.erp_integrations.update_one(
        {"user_id": user["id"], "company_id": cid},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {
        "ok": True,
        "generated_token": raw_token if generated else None,
        "connection": {
            "system_name": doc["system_name"],
            "erp_base_url": doc["erp_base_url"],
            "external_webhook_url": doc["external_webhook_url"],
            "auth_mode": doc["auth_mode"],
            "auth_header_name": doc["auth_header_name"],
            "auth_query_name": doc["auth_query_name"],
            "auth_prefix": doc["auth_prefix"],
            "token_mask": doc["token_mask"],
            "webhook_url": f"{_public_api_base(request)}/api/erp-integration/inbound/{endpoint_id}",
            "updated_at": now,
        },
    }


@router.delete("/erp-integration")
async def erp_integration_disconnect(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    if not cid:
        raise HTTPException(status_code=400, detail="Empresa ativa não encontrada")
    now = datetime.now(timezone.utc).isoformat()
    await db.erp_integrations.update_one(
        {"user_id": user["id"], "company_id": cid},
        {"$set": {"active": False, "updated_at": now, "disconnected_at": now}},
    )
    await db.erp_financial_contexts.delete_one({"user_id": user["id"], "company_id": cid})
    await invalidate_ai_cache(user["id"])
    return {"ok": True}


@router.post("/erp-integration/inbound/{endpoint_id}")
async def erp_integration_inbound(endpoint_id: str, request: Request):
    conn = await db.erp_integrations.find_one({"endpoint_id": endpoint_id, "active": True})
    if not conn:
        raise HTTPException(status_code=404, detail="Integração não encontrada")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload JSON inválido")
    provided_token = _extract_inbound_token(conn, request)
    token_hash = hashlib.sha256(provided_token.strip().encode("utf-8")).hexdigest()
    if not secrets.compare_digest(token_hash, conn.get("token_hash") or ""):
        raise HTTPException(status_code=401, detail="Token de integração inválido")
    normalized = _normalize_financial_payload(payload if isinstance(payload, dict) else {})
    if not normalized["meaningful"]:
        raise HTTPException(status_code=400, detail="O payload não contém saldo, dívida, custos fixos ou outros dados financeiros aproveitáveis.")
    now = datetime.now(timezone.utc).isoformat()
    event_doc = {
        "user_id": conn["user_id"],
        "company_id": conn["company_id"],
        "endpoint_id": endpoint_id,
        "event_key": normalized["event_key"],
        "event_type": normalized["event_type"],
        "received_at": now,
        "occurred_at": normalized["occurred_at"],
        "summary": {
            "cash_balance": normalized["context"].get("cash_balance"),
            "total_debt": normalized["context"].get("total_debt"),
            "monthly_revenue": normalized["context"].get("monthly_revenue"),
            "fixed_costs_count": len(normalized["context"].get("fixed_costs") or []),
        },
        "raw_payload": payload,
    }
    try:
        await db.erp_events.insert_one(event_doc)
    except Exception:
        existing = await db.erp_events.find_one({"endpoint_id": endpoint_id, "event_key": normalized["event_key"]}, {"_id": 0})
        if existing:
            return {"accepted": True, "duplicate": True, "event_key": normalized["event_key"]}
        raise
    source_label = f"Sistema de gestão · {conn.get('system_name') or 'ERP'}"
    existing_ctx = await db.erp_financial_contexts.find_one({"user_id": conn["user_id"], "company_id": conn["company_id"]}, {"_id": 0}) or {}
    existing_ctx.pop("created_at", None)
    ctx = {**existing_ctx, **normalized["context"]}
    await db.erp_financial_contexts.update_one(
        {"user_id": conn["user_id"], "company_id": conn["company_id"]},
        {"$set": {
            "user_id": conn["user_id"],
            "company_id": conn["company_id"],
            "active": True,
            "system_name": conn.get("system_name") or "Sistema de Gestão",
            "source_label": source_label,
            "last_event_key": normalized["event_key"],
            "last_event_type": normalized["event_type"],
            "last_detected_aliases": normalized.get("detected") or {},
            "last_present_fields": normalized.get("present_fields") or [],
            "last_payload_at": now,
            "updated_at": now,
            **ctx,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    await db.erp_integrations.update_one(
        {"endpoint_id": endpoint_id},
        {"$set": {"last_payload_at": now, "last_event_key": normalized["event_key"], "updated_at": now}},
    )
    await invalidate_ai_cache(conn["user_id"])
    return {
        "accepted": True,
        "duplicate": False,
        "event_key": normalized["event_key"],
        "context": {
            "cash_balance": ctx.get("cash_balance"),
            "total_debt": ctx.get("total_debt"),
            "monthly_revenue": ctx.get("monthly_revenue"),
            "fixed_costs_count": len(ctx.get("fixed_costs") or []),
        },
    }