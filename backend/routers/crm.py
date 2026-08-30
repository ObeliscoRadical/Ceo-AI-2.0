"""CRM do Diretor Comercial — cliente ideal (ICP), pipeline, lead score e rascunhos por IA."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from urllib.parse import quote
from core import *

router = APIRouter()

STAGES = ["novo", "qualificado", "reuniao", "proposta", "negociacao", "ganho", "perdido"]


class IcpIn(BaseModel):
    sector: Optional[str] = None
    size: Optional[str] = None            # micro | pequena | media | grande
    region: Optional[str] = None
    decisor: Optional[str] = None
    dor: Optional[str] = None
    ticket_ideal: Optional[float] = None
    urgencia: Optional[str] = None
    notas: Optional[str] = None


class LeadIn(BaseModel):
    id: Optional[str] = None
    name: str
    contact: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    region: Optional[str] = None
    value: Optional[float] = None
    urgency: Optional[str] = None          # baixa | media | alta
    stage: Optional[str] = "novo"
    notes: Optional[str] = None
    source: Optional[str] = None


class DraftIn(BaseModel):
    kind: str                               # "proposal" | "email"


def compute_lead_score(lead: dict, icp: dict, monthly_revenue) -> int:
    score = 40
    val = lead.get("value") or 0
    if val and val > 0:
        if monthly_revenue and monthly_revenue > 0:
            score += min(20, int(val / monthly_revenue * 10))
        else:
            score += 10
    score += {"alta": 15, "media": 8, "baixa": 0}.get(lead.get("urgency") or "", 4)
    if icp:
        ls, li = (lead.get("sector") or "").lower(), (icp.get("sector") or "").lower()
        if ls and li and (ls in li or li in ls):
            score += 12
        if lead.get("size") and icp.get("size") and lead["size"] == icp["size"]:
            score += 8
        if lead.get("region") and icp.get("region") and lead["region"] == icp["region"]:
            score += 5
    score += {"novo": 0, "qualificado": 5, "reuniao": 8, "proposta": 12,
              "negociacao": 16, "ganho": 20, "perdido": 0}.get(lead.get("stage") or "novo", 0)
    return max(0, min(100, score))


def score_label(s: int) -> str:
    return "quente" if s >= 70 else "morno" if s >= 45 else "frio"


async def _monthly_revenue(uid: str):
    snap = await build_snapshot(uid)
    ar = (snap.get("valuation") or {}).get("annual_revenue")
    return (ar / 12.0) if isinstance(ar, (int, float)) and ar else None


async def _company_ctx(uid: str):
    snap = await build_snapshot(uid)
    company = await resolve_company(uid) or {}
    prof = company.get("profile", {}) or {}
    return {
        "name": company.get("name") or snap.get("company_name") or "A empresa",
        "sector": company.get("sector") or prof.get("sector") or "Geral",
        "region": company.get("region", "PT"),
        "sym": snap.get("currency_symbol", "€"),
        "business_model": prof.get("business_model", ""),
    }


# ------------------------------- ICP -------------------------------
@router.get("/crm/icp")
async def get_icp(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    doc = await db.crm_icp.find_one({"user_id": uid, "company_id": cid})
    if doc:
        doc.pop("_id", None)
    return {"icp": doc or None}


@router.post("/crm/icp")
async def save_icp(inp: IcpIn, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    data = inp.model_dump()
    data.update({"user_id": uid, "company_id": cid, "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.crm_icp.update_one({"user_id": uid, "company_id": cid}, {"$set": data}, upsert=True)
    return {"ok": True}


@router.post("/crm/icp/suggest")
async def suggest_icp(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    c = await _company_ctx(uid)
    system = ("És o Diretor Comercial de um conselho executivo digital para PMEs. Defines o perfil de cliente ideal (ICP). Português europeu.")
    prompt = (
        f"Empresa: {c['name']} · Setor: {c['sector']} · Região: {c['region']} · Modelo: {c['business_model'] or 'n/d'}.\n"
        "Define o CLIENTE IDEAL (ICP) para esta empresa. Devolve APENAS JSON: "
        '{"sector":str,"size":str,"region":str,"decisor":str,"dor":str,"ticket_ideal":number,"urgencia":str,"notas":str}. '
        '"size" ∈ {micro, pequena, media, grande}. "ticket_ideal" em número (valor médio de negócio). '
        '"notas": 1-2 frases sobre onde encontrar e como abordar este cliente.'
    )
    icp = await ai_json(system, prompt) or {}
    return {"icp": icp}


# ------------------------------- LEADS -------------------------------
def _serialize_lead(l: dict) -> dict:
    l = dict(l); l["id"] = str(l.pop("_id")); l.pop("user_id", None); l.pop("company_id", None)
    return l


@router.get("/crm/leads")
async def list_leads(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    leads = await db.crm_leads.find({"user_id": uid, "company_id": cid}).sort("created_at", -1).to_list(500)
    out = [_serialize_lead(l) for l in leads]
    counts = {s: 0 for s in STAGES}
    total_value = 0
    for l in out:
        counts[l.get("stage", "novo")] = counts.get(l.get("stage", "novo"), 0) + 1
        if l.get("stage") not in ("perdido",) and l.get("value"):
            total_value += l["value"]
    return {"leads": out, "stages": STAGES, "counts": counts, "pipeline_value": total_value}


@router.post("/crm/leads")
async def upsert_lead(inp: LeadIn, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    icp = await db.crm_icp.find_one({"user_id": uid, "company_id": cid}) or {}
    mrev = await _monthly_revenue(uid)
    data = inp.model_dump(exclude_unset=True)
    lead_id = data.pop("id", None)
    if data.get("stage") and data["stage"] not in STAGES:
        data["stage"] = "novo"
    if lead_id:
        existing = await db.crm_leads.find_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid})
        if not existing:
            raise HTTPException(404, "lead não encontrado")
        merged = {**existing, **data}
        merged["score"] = compute_lead_score(merged, icp, mrev)
        await db.crm_leads.update_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid},
                                      {"$set": {**data, "score": merged["score"], "updated_at": datetime.now(timezone.utc).isoformat()}})
        doc = await db.crm_leads.find_one({"_id": ObjectId(lead_id)})
    else:
        data.setdefault("stage", "novo")
        data["score"] = compute_lead_score(data, icp, mrev)
        data.update({"user_id": uid, "company_id": cid, "created_at": datetime.now(timezone.utc).isoformat()})
        res = await db.crm_leads.insert_one(data)
        doc = await db.crm_leads.find_one({"_id": res.inserted_id})
    return {"lead": _serialize_lead(doc)}


@router.post("/crm/leads/{lead_id}/stage")
async def move_stage(lead_id: str, body: dict, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    stage = body.get("stage")
    if stage not in STAGES:
        raise HTTPException(400, "stage inválido")
    icp = await db.crm_icp.find_one({"user_id": uid, "company_id": cid}) or {}
    mrev = await _monthly_revenue(uid)
    existing = await db.crm_leads.find_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid})
    if not existing:
        raise HTTPException(404, "lead não encontrado")
    existing["stage"] = stage
    sc = compute_lead_score(existing, icp, mrev)
    await db.crm_leads.update_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid}, {"$set": {"stage": stage, "score": sc}})
    return {"ok": True, "score": sc}


@router.delete("/crm/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    await db.crm_leads.delete_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid})
    return {"ok": True}


@router.post("/crm/leads/{lead_id}/draft")
async def draft_lead(lead_id: str, inp: DraftIn, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    lead = await db.crm_leads.find_one({"_id": ObjectId(lead_id), "user_id": uid})
    if not lead:
        raise HTTPException(404, "lead não encontrado")
    c = await _company_ctx(uid)
    sym = c["sym"]
    ldesc = (f"Lead: {lead.get('name')} · Setor: {lead.get('sector') or 'n/d'} · Dimensão: {lead.get('size') or 'n/d'} · "
             f"Valor potencial: {sym}{int(lead.get('value') or 0)} · Urgência: {lead.get('urgency') or 'n/d'} · "
             f"Fase: {lead.get('stage')} · Notas: {lead.get('notes') or '—'}")
    system = ("És o Diretor Comercial de um conselho executivo digital para PMEs. Escreves propostas e emails comerciais "
              "persuasivos, profissionais e concisos. Português europeu.")
    if inp.kind == "email":
        prompt = (f"Empresa que vende: {c['name']} ({c['sector']}).\n{ldesc}\n\n"
                  "Escreve um EMAIL de prospeção/follow-up curto e personalizado para este lead. "
                  'Devolve APENAS JSON: {"assunto":str,"corpo":str}. Corpo com saudação, 1-2 parágrafos de valor e um CTA claro para reunião.')
    else:
        prompt = (f"Empresa que vende: {c['name']} ({c['sector']}).\n{ldesc}\n\n"
                  "Escreve uma PROPOSTA COMERCIAL estruturada para este lead. "
                  'Devolve APENAS JSON: {"titulo":str,"corpo":str}. O corpo deve incluir: contexto/problema, solução proposta, '
                  f"o que está incluído, investimento sugerido (usa {sym} e o valor potencial como referência) e próximos passos.")
    draft = await ai_json(system, prompt) or {}
    return {"draft": draft, "kind": inp.kind}


class SendSimIn(BaseModel):
    channel: str                            # "whatsapp" | "email"
    message: str
    subject: Optional[str] = None


@router.post("/crm/leads/{lead_id}/send-sim")
async def send_sim(lead_id: str, inp: SendSimIn, user: dict = Depends(premium_user)):
    """Simulação de Envio: entrega a mensagem do lead no WhatsApp (link wa.me) ou no email do próprio
    utilizador, para validar o motor de IA antes das integrações oficiais (Meta)."""
    uid = user["id"]; cid = await active_company_id(uid)
    lead = await db.crm_leads.find_one({"_id": ObjectId(lead_id), "user_id": uid, "company_id": cid})
    if not lead:
        raise HTTPException(404, "lead não encontrado")
    now_iso = datetime.now(timezone.utc).isoformat()
    result = {}
    if inp.channel == "whatsapp":
        phone = "".join(ch for ch in (lead.get("contact") or "") if ch.isdigit())
        result["wa_link"] = f"https://wa.me/{phone}?text={quote(inp.message)}" if phone else f"https://wa.me/?text={quote(inp.message)}"
    else:
        u = await db.users.find_one({"_id": ObjectId(uid)})
        if not u or not u.get("email"):
            return {"ok": False, "reason": "no_email"}
        body = inp.message.replace("\n", "<br>")
        html = (f"<div style='font-family:Arial,sans-serif;max-width:600px'>"
                f"<h2 style='color:#3B82F6'>Simulação de Envio — CEO AI 2.0</h2>"
                f"<p><b>Lead:</b> {lead.get('name')}<br><b>Contacto:</b> {lead.get('contact') or 'n/d'}<br>"
                f"<b>Setor:</b> {lead.get('sector') or 'n/d'} · <b>Fase:</b> {lead.get('stage')} · <b>Score:</b> {lead.get('score')}</p>"
                f"<hr><p><b>Mensagem sugerida:</b></p><div style='background:#f6f7f9;padding:16px;border-radius:12px'>{body}</div>"
                f"<p style='color:#888;font-size:12px;margin-top:16px'>Reveja e envie ao cliente. Quando validar, ativamos o envio automático oficial.</p></div>")
        await send_email_raw(u["email"], inp.subject or f"Lead: {lead.get('name')} — mensagem sugerida", html)
        result["sent_to"] = u["email"]
    await db.crm_outreach.insert_one({"user_id": uid, "company_id": cid, "lead_id": lead_id,
                                      "channel": inp.channel, "message": inp.message, "created_at": now_iso})
    return {"ok": True, **result}
