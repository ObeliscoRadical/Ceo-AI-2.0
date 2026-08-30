"""Conselho Executivo Digital — arquitetura modular.
Orquestrador (Cérebro) + Diretores IA especializados que partilham um contexto comum.
Preparado para integrações reais (redes sociais, CRM) em fases seguintes sem refatorar.
"""
from fastapi import APIRouter, Depends
from core import *
import asyncio

router = APIRouter()

# ---------------------------------------------------------------------------
# Contexto comum partilhado por todos os diretores (dados determinísticos)
# ---------------------------------------------------------------------------
async def build_council_context(uid: str, cid):
    snap = await build_snapshot(uid)
    company = await resolve_company(uid) or {}
    prof = company.get("profile", {}) or {}
    val = snap.get("valuation", {}) or {}
    goal = await db.goals.find_one({"user_id": uid, "company_id": cid}) or {}
    sym = snap.get("currency_symbol", "€")
    # Top oportunidades de apoios (motor determinístico) para o Diretor de Apoios
    grants_top = []
    try:
        from routers.grants import _eligibility_profile, _match_all
        gp = await _eligibility_profile(uid, cid)
        for o in _match_all(gp, gp.get("country") or "PT")[:4]:
            grants_top.append({"titulo": o["title"], "entidade": o["entity"], "tipo": o["type_label"],
                               "elegibilidade": o["eligibility_label"], "prazo": o["deadline"]})
    except Exception:
        grants_top = []
    return {
        "currency_symbol": sym,
        "company_name": company.get("name") or snap.get("company_name") or "A empresa",
        "sector": company.get("sector") or prof.get("sector") or prof.get("activity") or "Geral",
        "region": company.get("region", "PT"),
        "employees": company.get("employees_count", 0),
        "clients": company.get("clients_count", 0),
        "business_model": prof.get("business_model", ""),
        "biggest_client_pct": prof.get("biggest_client_pct"),
        "client_recurrence": prof.get("client_recurrence", ""),
        "founder_dependency": prof.get("founder_dependency", ""),
        "health": snap.get("health"),
        "cash": snap.get("cash_available"),
        "monthly_net": snap.get("monthly_net"),
        "runway": snap.get("runway"),
        "annual_revenue": val.get("annual_revenue"),
        "annual_profit": val.get("annual_profit"),
        "company_value": snap.get("company_value"),
        "net_worth": snap.get("net_worth"),
        "total_liabilities": snap.get("total_liabilities"),
        "goal_value": goal.get("target_value"),
        "grants_top": grants_top,
    }


def _ctx_text(c):
    s = c["currency_symbol"]
    n = lambda v: f"{s}{int(round(v))}" if isinstance(v, (int, float)) else "n/d"
    grants = c.get("grants_top") or []
    grants_line = ""
    if grants:
        gl = "; ".join(f"{g['titulo']} ({g['entidade']}, {g['tipo']}, {g['elegibilidade']})" for g in grants)
        grants_line = f"Apoios/incentivos potencialmente elegíveis: {gl}\n"
    return (
        f"Empresa: {c['company_name']} · Setor: {c['sector']} · Região: {c['region']}\n"
        f"Funcionários: {c['employees']} · Clientes: {c['clients']}\n"
        f"Modelo de negócio: {c['business_model'] or 'n/d'}\n"
        f"Maior cliente: {c['biggest_client_pct'] or 'n/d'}% das vendas · Recorrência: {c['client_recurrence'] or 'n/d'} · Dependência do fundador: {c['founder_dependency'] or 'n/d'}\n"
        f"Saúde: {c['health']}/100 · Caixa: {n(c['cash'])} · Resultado mensal: {n(c['monthly_net'])} · Autonomia: {c['runway']} meses\n"
        f"Faturação anual: {n(c['annual_revenue'])} · Lucro anual: {n(c['annual_profit'])}\n"
        f"Valor da empresa: {n(c['company_value'])} · Património: {n(c['net_worth'])} · Passivos: {n(c['total_liabilities'])}\n"
        f"Meta de valor: {n(c['goal_value'])}\n"
        f"{grants_line}"
    )


_JSON_SHAPE = (
    'Responde APENAS com JSON válido, sem texto fora do JSON, no formato: '
    '{"situacao":str,"indicadores":[{"label":str,"valor":str}],'
    '"prioridades":[str],"acoes":[{"acao":str,"impacto":str}],"execucao":[str]}. '
    '"situacao": 2-3 frases sobre o estado atual na tua área, com números reais. '
    '"indicadores": 2-3 métricas-chave. "prioridades": 2-4 focos. '
    '"acoes": 2-4 ações concretas com "impacto" estimado (em ' 
)

DIRECTORS = {
    "financeiro": {
        "label": "Diretor Financeiro",
        "system": "És o Diretor Financeiro (CFO) de um conselho executivo digital para PMEs. Analisas fluxo de caixa, rentabilidade, necessidade de faturação e prioridades financeiras. Rigoroso, prático, orientado a números. Português europeu.",
        "focus": "Avalia o fluxo de caixa, a autonomia (runway), a necessidade de faturação, a margem e os riscos financeiros. 'execucao' = o que farias ao aprovar (ex.: definir reserva de impostos, plano de cobrança, corte de custo específico).",
    },
    "comercial": {
        "label": "Diretor Comercial",
        "system": "És o Diretor Comercial (CRO) de um conselho executivo digital para PMEs. Defines o cliente ideal, encontras oportunidades, atribuis Lead Score, preparas propostas e emails e geres o pipeline/CRM. Orientado a vendas e conversão. Português europeu.",
        "focus": "Define o perfil de cliente ideal (ICP) para este negócio, avalia concentração de clientes e recorrência, e propõe como gerar e converter mais oportunidades. 'execucao' = o que farias ao aprovar (ex.: criar ICP no CRM, preparar N propostas/emails, definir cadência de follow-up).",
    },
    "marketing": {
        "label": "Diretor de Marketing",
        "system": "És o Diretor de Marketing (CMO) de um conselho executivo digital para PMEs. Analisas a identidade da marca e crias conteúdos, posts, Stories, Reels, anúncios e calendário editorial consistentes. Criativo mas orientado a resultados. Português europeu.",
        "focus": "Analisa a identidade/posicionamento da marca e propõe uma linha de conteúdos e campanhas coerentes com o setor e o cliente ideal. 'execucao' = o que farias ao aprovar (ex.: calendário editorial semanal, 3 posts, 1 Reel, 1 campanha de anúncios) — indica onde publicarias (Instagram/Facebook/Google Business) mesmo que a ligação seja feita depois.",
    },
    "apoios": {
        "label": "Diretor de Apoios",
        "system": "És o Diretor de Apoios e Incentivos (Grants) de um conselho executivo digital para PMEs. Identificas apoios públicos, incentivos fiscais, fundos e financiamento aplicáveis e defines a estratégia de candidatura. Rigoroso e prático. NUNCA inventes apoios, prazos ou montantes que não estejam no contexto; NUNCA garantas aprovação (fala em elegibilidade estimada). Português europeu.",
        "focus": "Com base nos apoios/incentivos listados no contexto (usa APENAS esses; se não houver, di-lo), indica quais atacar primeiro, porquê encaixam no perfil e o que falta preparar. 'execucao' = o que farias ao aprovar (ex.: iniciar candidatura X, reunir documentos, confirmar prazo no portal oficial da entidade).",
    },
}


async def _run_director(key: str, ctx_text: str, sym: str):
    d = DIRECTORS[key]
    prompt = (
        f"CONTEXTO ATUAL DA EMPRESA (usa só estes números, nunca inventes):\n{ctx_text}\n\n"
        f"TAREFA: {d['focus']}\n\n" + _JSON_SHAPE + f"{sym} ou %). \"execucao\": 2-4 itens do que executarias após aprovação."
    )
    out = await ai_json(d["system"], prompt)
    out = out or {}
    out.setdefault("situacao", "Análise indisponível de momento — tente gerar a reunião novamente.")
    for k in ("indicadores", "prioridades", "acoes", "execucao"):
        out.setdefault(k, [])
    return key, out


async def _run_brain(ctx_text: str, directors: dict, sym: str):
    system = (
        "És o Cérebro Orquestrador (CEO AI 2.0) de um conselho executivo digital. Recebes as análises dos "
        "Diretores Financeiro, Comercial e de Marketing e cruzas tudo numa ÚNICA estratégia recomendada, "
        "coerente e priorizada, para a empresa executar hoje. Português europeu."
    )
    dj = json.dumps({k: {"situacao": v.get("situacao"), "prioridades": v.get("prioridades"),
                         "acoes": v.get("acoes")} for k, v in directors.items()}, ensure_ascii=False)
    prompt = (
        f"CONTEXTO:\n{ctx_text}\n\nANÁLISES DOS DIRETORES:\n{dj}\n\n"
        "Cruza a informação e devolve APENAS JSON no formato: "
        '{"resumo":str,"foco_principal":str,"estrategia":[{"passo":str,"responsavel":str,"porque":str}],'
        '"kpis":[{"label":str,"meta":str}],"risco":str}. '
        '"resumo": 2-3 frases sobre a situação global e o que fazer hoje. '
        '"foco_principal": a prioridade número 1. '
        '"estrategia": 3-5 passos ordenados; "responsavel" ∈ {Financeiro, Comercial, Marketing, Apoios}; "porque" liga aos números. '
        '"kpis": 2-4 indicadores a acompanhar. "risco": 1 frase sobre o maior risco.'
    )
    return await ai_json(system, prompt) or {}


async def _generate_meeting(uid: str, cid):
    ctx = await build_council_context(uid, cid)
    ctx_text = _ctx_text(ctx)
    sym = ctx["currency_symbol"]
    results = await asyncio.gather(*[_run_director(k, ctx_text, sym) for k in DIRECTORS])
    directors = {k: v for k, v in results}
    brain = await _run_brain(ctx_text, directors, sym)
    today = datetime.now(timezone.utc).date().isoformat()
    doc = {
        "user_id": uid, "company_id": cid, "date": today,
        "context": ctx, "directors": directors, "brain": brain,
        "approved": False, "approved_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.council_meetings.update_one(
        {"user_id": uid, "company_id": cid, "date": today}, {"$set": doc}, upsert=True)
    return doc


def _serialize(doc):
    if not doc:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


# Estado das integrações (preparado para Fase 4 — ligação real Meta/Google)
def _integrations_status(company):
    conn = (company or {}).get("integrations", {}) or {}
    keys = ["instagram", "facebook", "google_business"]
    labels = {"instagram": "Instagram", "facebook": "Facebook", "google_business": "Google Business"}
    return [{"key": k, "label": labels[k], "status": conn.get(k, "not_connected")} for k in keys]


@router.get("/council/meeting")
async def get_meeting(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    today = datetime.now(timezone.utc).date().isoformat()
    doc = await db.council_meetings.find_one({"user_id": uid, "company_id": cid, "date": today})
    company = await resolve_company(uid) or {}
    if doc:
        return {"generated": True, "meeting": _serialize(doc), "integrations": _integrations_status(company)}
    # ainda não gerada hoje — devolve o contexto determinístico para o dashboard
    ctx = await build_council_context(uid, cid)
    return {"generated": False, "context": ctx, "date": today, "integrations": _integrations_status(company)}


@router.post("/council/meeting/generate")
async def generate_meeting(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.council_meetings.find_one({"user_id": uid, "company_id": cid, "date": today})
    if existing:
        return {"generated": True, "meeting": _serialize(existing)}
    doc = await _generate_meeting(uid, cid)
    return {"generated": True, "meeting": _serialize(doc)}


@router.post("/council/meeting/refresh")
async def refresh_meeting(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    doc = await _generate_meeting(uid, cid)
    return {"generated": True, "meeting": _serialize(doc)}


@router.post("/council/meeting/approve")
async def approve_meeting(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    today = datetime.now(timezone.utc).date().isoformat()
    doc = await db.council_meetings.find_one({"user_id": uid, "company_id": cid, "date": today})
    if not doc:
        return {"ok": False, "reason": "no_meeting"}
    now_iso = datetime.now(timezone.utc).isoformat()
    # cria tarefas de execução por diretor (preparado para execução real nas próximas fases)
    tasks = []
    for key, d in (doc.get("directors") or {}).items():
        for item in (d.get("execucao") or []):
            tasks.append({"user_id": uid, "company_id": cid, "meeting_date": today,
                          "director": key, "task": item, "status": "pendente", "created_at": now_iso})
    if tasks:
        await db.council_tasks.delete_many({"user_id": uid, "company_id": cid, "meeting_date": today})
        await db.council_tasks.insert_many(tasks)
    await db.council_meetings.update_one({"_id": doc["_id"]},
                                         {"$set": {"approved": True, "approved_at": now_iso}})
    return {"ok": True, "tasks": len(tasks)}


@router.get("/council/tasks")
async def council_tasks(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    today = datetime.now(timezone.utc).date().isoformat()
    ts = await db.council_tasks.find({"user_id": uid, "company_id": cid, "meeting_date": today}).to_list(200)
    return {"tasks": [{"director": t["director"], "task": t["task"], "status": t["status"]} for t in ts]}
