from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *
from core import _growth_score

router = APIRouter()

@router.get("/memories")
async def list_memories(user: dict = Depends(get_current_user)):
    mems = await db.memories.find({"user_id": user["id"]}).sort("created_at", -1).to_list(500)
    for m in mems:
        m["id"] = str(m["_id"]); m.pop("_id")
    return mems

@router.post("/memories")
async def add_memory(inp: MemoryInput, user: dict = Depends(get_current_user)):
    doc = {"user_id": user["id"], "content": inp.content, "category": inp.category,
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.memories.insert_one(doc)
    return {"id": str(res.inserted_id), **inp.model_dump()}

@router.delete("/memories/{mem_id}")
async def del_memory(mem_id: str, user: dict = Depends(get_current_user)):
    await db.memories.delete_one({"_id": ObjectId(mem_id), "user_id": user["id"]})
    return {"ok": True}

DEFAULT_SETTINGS = {"ceo_mode": "crescimento", "theme": "dark", "briefing_count": 4,
                    "briefing_tone": "direto", "model": "claude", "email_briefing": False, "email_marketing_briefing": False, "email_value_alert": True,
                    "email_grant_alerts": True, "tour_completed": False,
                    "monitored_widgets": ["cashflow", "profit", "clients", "tax", "employees", "bank", "risk"]}

@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"user_id": user["id"]}) or {}
    s.pop("_id", None); s.pop("user_id", None); s.pop("active_company_id", None)
    return {**DEFAULT_SETTINGS, **s}

@router.put("/settings")
async def update_settings(inp: SettingsInput, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in inp.model_dump().items() if v is not None}
    await db.settings.update_one({"user_id": user["id"]}, {"$set": data}, upsert=True)
    s = await db.settings.find_one({"user_id": user["id"]}) or {}
    s.pop("_id", None); s.pop("user_id", None); s.pop("active_company_id", None)
    return {**DEFAULT_SETTINGS, **s}

# ---------------------------------------------------------------- chat
@router.get("/chat/sessions")
async def chat_sessions(user: dict = Depends(premium_user)):
    sess = await db.chat_sessions.find({"user_id": user["id"], "session_id": {"$exists": True}}).sort("created_at", -1).to_list(100)
    return [{"session_id": s.get("session_id"), "title": s.get("title", "Conversa"), "created_at": s.get("created_at")}
            for s in sess if s.get("session_id")]

@router.get("/chat/{session_id}/messages")
async def chat_messages(session_id: str, user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"session_id": session_id, "user_id": user["id"]}).sort("created_at", 1).to_list(1000)
    return [{"role": m["role"], "content": m["content"]} for m in msgs]

@router.delete("/chat/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    await db.chat_sessions.delete_one({"session_id": session_id, "user_id": user["id"]})
    await db.chat_messages.delete_many({"session_id": session_id, "user_id": user["id"]})
    return {"ok": True}

@router.post("/chat")
async def chat(inp: ChatInput, user: dict = Depends(premium_user)):
    session_id = inp.session_id
    if not session_id:
        session_id = str(uuid.uuid4())
        await db.chat_sessions.insert_one({"session_id": session_id, "user_id": user["id"],
                                           "title": (inp.message[:50] or "Nova conversa"), "created_at": datetime.now(timezone.utc).isoformat()})
    history = await db.chat_messages.find({"session_id": session_id, "user_id": user["id"]}).sort("created_at", 1).to_list(1000)

    attachments = []
    if inp.attachment_ids:
        for aid in inp.attachment_ids:
            try:
                a = await db.chat_attachments.find_one({"_id": ObjectId(aid), "user_id": user["id"]})
                if a:
                    attachments.append(a)
            except Exception:
                pass
    images = [a for a in attachments if a.get("kind") == "image"]
    docs = [a for a in attachments if a.get("kind") == "doc"]
    att_note = "  ".join(f"📎 {a['filename']}" for a in attachments)
    stored_content = (inp.message + ("\n\n" + att_note if att_note else "")).strip()
    await db.chat_messages.insert_one({"session_id": session_id, "user_id": user["id"], "role": "user",
                                       "content": stored_content, "created_at": datetime.now(timezone.utc).isoformat()})

    context_msg = inp.message or "Analisa o ficheiro que anexei e diz-me o que é relevante para a minha empresa."
    if history:
        hist_txt = "\n".join(f"{h['role']}: {h['content']}" for h in history[-10:])
        context_msg = f"[Histórico da conversa]\n{hist_txt}\n\n[Nova mensagem do empresário]\n{context_msg}"
    if docs:
        doc_blk = "\n\n".join(f"[Ficheiro: {d['filename']}]\n{(d.get('text') or '')[:6000]}" for d in docs)
        context_msg += f"\n\n[Documentos anexados pelo empresário para análise]\n{doc_blk}"

    file_contents = [ImageContent(image_base64=img["base64"]) for img in images if img.get("base64")]
    chat_obj = await get_chat(user["id"], user.get("name", ""), session_id, vision=bool(file_contents))

    async def gen():
        full = ""
        try:
            um = UserMessage(text=context_msg, file_contents=file_contents) if file_contents else UserMessage(text=context_msg)
            async for ev in chat_obj.stream_message(um):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error(f"chat error: {e}")
            yield f"data: {json.dumps({'delta': ' [erro de ligação com o CEO AI 2.0]'})}\n\n"
        await db.chat_messages.insert_one({"session_id": session_id, "user_id": user["id"], "role": "assistant",
                                           "content": full, "created_at": datetime.now(timezone.utc).isoformat()})
        if inp.attachment_ids:
            try:
                await db.chat_attachments.delete_many({"_id": {"$in": [ObjectId(a) for a in inp.attachment_ids]}, "user_id": user["id"]})
            except Exception:
                pass
        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@router.post("/chat/attachment")
async def chat_attachment(file: UploadFile = File(...), user: dict = Depends(premium_user)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ficheiro demasiado grande (máx 8MB).")
    ct = (file.content_type or "").lower()
    doc = {"user_id": user["id"], "filename": file.filename, "content_type": ct,
           "created_at": datetime.now(timezone.utc).isoformat()}
    if ct.startswith("image/"):
        import base64
        doc["kind"] = "image"
        doc["base64"] = base64.b64encode(data).decode()
    else:
        text = ""
        try:
            text = extract_document_text(data, ct, file.filename or "")
        except Exception as e:
            logger.error(f"attach extract: {e}")
        doc["kind"] = "doc"
        doc["text"] = (text or "")[:20000]
    res = await db.chat_attachments.insert_one(doc)
    return {"id": str(res.inserted_id), "kind": doc["kind"], "filename": file.filename}

@router.get("/briefing")
async def briefing(user: dict = Depends(get_current_user)):
    return await make_briefing(user["id"], user.get("name", ""))

@router.post("/briefing/email")
async def send_briefing_email(request: Request, user: dict = Depends(get_current_user)):
    data = await make_briefing(user["id"], user.get("name", ""))
    app_url = request.headers.get("origin") or os.environ.get("FRONTEND_URL", "")
    html = build_briefing_html(user.get("name", ""), data, app_url)
    ok = await send_email_raw(user["email"], "O teu briefing diário — CEO AI 2.0", html)
    if not ok:
        raise HTTPException(502, "Não foi possível enviar o email")
    return {"sent": True, "to": user["email"]}

@router.get("/decisions")
async def decisions(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    snap = await build_snapshot(uid)
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        "Como CEO, define o veredicto de hoje e as decisões prioritárias. Devolve APENAS JSON: "
        '{"verdict":str,"decisions":[{"title":str,"why":str,"impact":str,"action":str,"urgency":"alta"|"media"|"baixa"}],'
        '"vitals_phrases":{"cashflow":str,"profit":str,"clients":str,"tax":str,"employees":str,"bank":str,"risk":str}}. '
        "O 'verdict' é 1 frase humana e directa sobre o estado hoje (sem números crus). 1 a 3 decisões concretas orientadas ao futuro, "
        "cada uma com o porquê, o impacto estimado (em € quando possível) e a acção. Em 'vitals_phrases', 1 frase-decisão curta por sinal vital. "
        "Português europeu, tom de executivo de confiança. Sem texto fora do JSON."
    )
    data = await cached_ai("decisions", uid, cid, sysmsg, prompt) or {"verdict": f"Olá {user.get('name','')}. Vamos focar no essencial hoje.", "decisions": [], "vitals_phrases": {}}
    today = datetime.now(timezone.utc).date().isoformat()
    fb = await db.decision_feedback.find({"user_id": uid, "company_id": cid, "date": today}).to_list(200)
    hidden = {f["key"] for f in fb}
    out = []
    for d in data.get("decisions", []):
        key = hashlib.md5(d.get("title", "").encode()).hexdigest()[:10]
        if key in hidden:
            continue
        d["key"] = key
        out.append(d)
    ph = data.get("vitals_phrases", {})
    for v in snap["vitals"]:
        v["phrase"] = ph.get(v["key"], v.get("hint", ""))
    return {"verdict": data.get("verdict"), "decisions": out, "vitals": snap["vitals"], "health": snap["health"],
            "company_value": snap["company_value"], "goal_value": snap["goal_value"], "progress": snap["progress"],
            "currency_symbol": snap["currency_symbol"], "company_name": snap["company_name"]}

@router.post("/decisions/act")
async def decisions_act(inp: DecisionActInput, user: dict = Depends(premium_user)):
    cid = await active_company_id(user["id"])
    today = datetime.now(timezone.utc).date().isoformat()
    await db.decision_feedback.update_one(
        {"user_id": user["id"], "company_id": cid, "date": today, "key": inp.key},
        {"$set": {"status": inp.status, "title": inp.title, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True}

@router.get("/ceo-daily")
async def ceo_daily(user: dict = Depends(get_current_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    snap = await build_snapshot(uid)
    growth = await _growth_score(uid, cid)
    runway = snap["runway"]; m_net = snap["monthly_net"]
    treasury = ("Confortável", "green") if runway >= 6 else ("Apertada", "amber") if runway >= 3 else ("Crítica", "red")
    cashflow = ("Positivo", "green") if m_net > 0 else ("Equilibrado", "amber") if m_net == 0 else ("Negativo", "red")
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    today = datetime.now(timezone.utc).date().isoformat()
    prompt = (
        f"Hoje é {today}. Como Diretor Executivo Digital, analisaste toda a empresa. Devolve APENAS JSON: "
        '{"conclusao":{"estado_geral":str,"oportunidades":str,"problemas":str,"prioridades":str},'
        '"recomendacoes":[{"title":str,"why":str,"priority":"urgente"|"importante"|"oportunidade"}]}. '
        "Em 'conclusao', cada campo tem 1-2 frases directas e humanas. Em 'recomendacoes', dá ENTRE 3 e 6 acções concretas "
        "e personalizadas para hoje (ex: 'Cobrar o cliente X', 'Não contratar este mês', 'Aumentar o preço médio', "
        "'Negociar com o fornecedor', 'Adiar a compra de equipamento 30 dias'), cada uma com o motivo ('why', 1 frase) "
        "e a prioridade. Varia a linguagem — a análise de hoje nunca deve ser igual à de outro dia. "
        "Português europeu, tom de CEO experiente, calmo e confiante. Sem texto fora do JSON."
    )
    data = await cached_ai("ceo_daily", uid, cid, sysmsg, prompt) or {
        "conclusao": {"estado_geral": "Ainda estou a conhecer a tua empresa. Adiciona dados financeiros para uma leitura completa.",
                      "oportunidades": "—", "problemas": "—", "prioridades": "Liga o teu banco ou importa um CSV."},
        "recomendacoes": []}
    fb = await db.decision_feedback.find({"user_id": uid, "company_id": cid, "date": today}).to_list(200)
    hidden = {f["key"] for f in fb}
    recs = []
    for r in data.get("recomendacoes", []):
        key = hashlib.md5((r.get("title", "") + today).encode()).hexdigest()[:10]
        if key in hidden:
            continue
        r["key"] = key
        recs.append(r)
    allowed = await can_access_premium(user)
    if not allowed:
        recs = []
    return {
        "user_name": user.get("name", ""),
        "company_name": snap["company_name"],
        "conclusao": data.get("conclusao", {}),
        "recomendacoes": recs,
        "premium_locked": not allowed,
        "vitals": {
            "saude": {"label": "Saúde Empresarial", "value": snap["health"], "unit": "/100",
                      "status": "green" if snap["health"] >= 70 else "amber" if snap["health"] >= 45 else "red"},
            "valor": {"label": "Valor estimado", "value": snap["company_value"], "unit": snap["currency_symbol"], "status": "gold"},
            "crescimento": {"label": "Probabilidade de crescimento", "value": growth, "unit": "%",
                            "status": "green" if growth >= 65 else "amber" if growth >= 45 else "red"},
            "tesouraria": {"label": "Tesouraria", "value": treasury[0], "unit": "", "status": treasury[1]},
            "fluxo": {"label": "Fluxo de caixa", "value": cashflow[0], "unit": "", "status": cashflow[1]},
        },
        "currency_symbol": snap["currency_symbol"],
        "has_data": snap["total_income"] > 0 or snap["total_expense"] > 0,
    }


@router.get("/health-index")
async def health_index(user: dict = Depends(premium_user)):
    uid = user["id"]
    snap = await build_snapshot(uid)
    company = await resolve_company(uid) or {}
    cid = str(company["_id"]) if company.get("_id") else None
    emp = int(company.get("employees_count", 0)); cli = int(company.get("clients_count", 0))
    g = await _growth_score(uid, cid)
    margin = snap["profit_margin"]; runway = snap["runway"]
    dims = {
        "Financeiro": snap["health"],
        "Clientes": min(100, 40 + cli * 5),
        "Equipa": min(100, 50 + emp * 6),
        "Dependência do Fundador": min(100, 28 + emp * 12 + (12 if cli > 5 else 0)),
        "Marca": min(100, 30 + cli * 4),
        "Liquidez": min(100, int(runway * 14)),
        "Margem": max(0, min(100, int(margin * 4) + 40)),
        "Crescimento": g,
        "Risco": min(100, int(runway * 12 + (20 if margin > 0 else 0))),
    }
    overall = round(sum(dims.values()) / len(dims))
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        "Explica o índice de Saúde Empresarial. Notas actuais (0-100): " + json.dumps(dims, ensure_ascii=False) +
        '. Devolve APENAS JSON: {"summary":str,"dimensions":{"<nome exacto>":{"why":str,"improve":str,"potential":str}}}. '
        "'summary': 1-2 frases sobre a saúde global. Por dimensão: 'why' (porque tem esta nota, 1 frase), 'improve' (o que fazer, 1 frase), "
        "'potential' (quanto pode subir, ex '+15 pontos'). Português europeu. Sem texto fora do JSON."
    )
    ai = await cached_ai("health", uid, cid, sysmsg, prompt) or {}
    notes = ai.get("dimensions", {})
    out = [{"dimension": k, "score": v, "why": notes.get(k, {}).get("why", ""),
            "improve": notes.get(k, {}).get("improve", ""), "potential": notes.get(k, {}).get("potential", "")} for k, v in dims.items()]
    return {"overall": overall, "summary": ai.get("summary", ""), "dimensions": out}

@router.get("/valuation")
async def valuation(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    snap = await build_snapshot(uid)
    sym = snap["currency_symbol"]; value = snap["company_value"]
    val = snap.get("valuation", {})
    conf = await compute_confidence(uid, bool(snap.get("has_balance")))
    figs = conf.pop("figures", {})
    m = conf["margin"]

    if not snap.get("has_balance"):
        if figs.get("assets"):
            nw = round(figs["assets"] - (figs.get("liabilities") or 0), 2)
            value = round(max(nw, 0), 2)
            val = {"net_worth": nw, "annual_profit": figs.get("net_profit"), "method": "com base nos teus relatórios"}
        else:
            return {"company_value": value, "currency_symbol": sym, "goal_value": snap["goal_value"], "progress": snap["progress"],
                    "net_worth": val.get("net_worth"), "method": val.get("method"), "annual_profit": val.get("annual_profit"),
                    "needs_financials": True, "confidence": conf,
                    "value_range": {"low": round(value * (1 - m)), "high": round(value * (1 + m))},
                    "financials_source": snap.get("financials_source"), "value_sources": snap.get("value_sources"),
                    "annual_revenue": val.get("annual_revenue"),
                    "factors": [], "actions": []}
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        f"Decompõe o valor da empresa (valor actual estimado {sym}{value}). Devolve APENAS JSON: "
        '{"factors":[{"name":str,"influence":"positiva"|"negativa"|"neutra","weight":str,"note":str}],'
        '"actions":[{"action":str,"uplift":str,"note":str}]}. '
        "'factors' DEVE incluir exactamente: Ativos, Marca, Carteira de Clientes, Capacidade de gerar lucro, Know-how, "
        "Potencial de crescimento, Dependência do Fundador — cada um com 'influence', 'weight' (ex '+18%' ou '-12%') e 'note' (1 frase). "
        "'actions': 3 a 5 formas concretas de aumentar o valuation (ex: contratar gestor operacional, criar contratos recorrentes, "
        "reduzir dependência do fundador, melhorar margem), cada uma com 'uplift' (ex '+45.000 €') e 'note'. Português europeu. Sem texto fora do JSON."
    )
    ai = await cached_ai("valuation", uid, cid, sysmsg, prompt) or {"factors": [], "actions": []}
    return {"company_value": value, "currency_symbol": sym, "goal_value": snap["goal_value"], "progress": snap["progress"],
            "net_worth": val.get("net_worth"), "method": val.get("method"), "annual_profit": val.get("annual_profit"),
            "annual_revenue": val.get("annual_revenue"),
            "confidence": conf, "value_range": {"low": round(value * (1 - m)), "high": round(value * (1 + m))},
            "financials_source": snap.get("financials_source"), "value_sources": snap.get("value_sources"),
            "factors": ai.get("factors", []), "actions": ai.get("actions", [])}

@router.get("/report")
async def strategic_report(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    snap = await build_snapshot(uid)
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        "Prepara um Relatório Estratégico da Empresa ao nível de uma consultora de topo (McKinsey/Deloitte). Devolve APENAS JSON: "
        '{"situacao_atual":str,"riscos":[str],"oportunidades":[str],"pontos_fortes":[str],"pontos_fracos":[str],'
        '"valor":{"atual":str,"comentario":str},"projecao_12m":str,"plano_acao":[{"acao":str,"prazo":str,"impacto":str}],"recomendacoes":[str]}. '
        "Profundo mas conciso, orientado a decisões e ao futuro, com linguagem executiva. Português europeu. Sem texto fora do JSON."
    )
    ai = await cached_ai("report", uid, cid, sysmsg, prompt) or {}
    ai = dict(ai)
    ai["company_name"] = snap["company_name"]; ai["health"] = snap["health"]
    ai["company_value"] = snap["company_value"]; ai["currency_symbol"] = snap["currency_symbol"]
    ai["generated_at"] = datetime.now(timezone.utc).isoformat()
    return ai

# ---------------------------------------------------------------- Future Engine (PREMIUM)
@router.get("/future")
async def future_projection(user: dict = Depends(get_current_user)):
    if not await can_access_premium(user):
        raise HTTPException(status_code=402, detail="premium_required")
    snap = await build_snapshot(user["id"])
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    now = datetime.now(timezone.utc)
    balance = snap["cash_balance"]; monthly_net = snap["monthly_net"]
    projection = []; b = balance
    for i in range(12):
        idx = (now.month - 1 + i) % 12
        b += monthly_net
        projection.append({"month": months[idx], "cash": round(b, 2)})
    projection[0]["cash"] = round(balance, 2)
    warning = None
    if monthly_net < 0:
        b2 = balance
        for i in range(12):
            b2 += monthly_net
            if b2 < 0:
                warning = f"Se continuar assim, em {months[(now.month - 1 + i) % 12]} fica sem caixa."
                break
    return {"projection": projection, "monthly_net": monthly_net, "warning": warning, "currency_symbol": snap["currency_symbol"]}

@router.post("/future/simulate")
async def simulate(inp: SimInput, user: dict = Depends(get_current_user)):
    if not await can_access_premium(user):
        raise HTTPException(status_code=402, detail="premium_required")
    sysmsg = await build_system_prompt(user["id"], user.get("name", ""))
    prompt = (
        f"O empresário quer simular esta decisão: '{inp.scenario}'. Detalhe: '{inp.detail}'. "
        f"Analisa o impacto FUTURO com base no estado actual. Devolve APENAS JSON: "
        f'{{"verdict":"favoravel"|"cautela"|"desaconselhado","summary":str,'
        f'"metrics":{{"lucro":str,"fluxo_caixa":str,"risco":str,"valuation":str,"saude":str}},'
        f'"recommendation":str,"timeline":str}}. '
        f"Em 'metrics' indica o impacto em cada eixo (ex: '+28.000 €/ano', '-2 meses de autonomia', 'sobe para 78/100'). "
        f"Sê concreto com números estimados. Português europeu. Sem texto fora do JSON."
    )
    ai = await ai_json(sysmsg, prompt)
    if not ai:
        raise HTTPException(status_code=500, detail="Não foi possível simular agora")
    return ai


@router.get("/signals")
async def signals(user: dict = Depends(get_current_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    snap = await build_snapshot(uid)
    company = await resolve_company(uid) or {}
    prof = company.get("profile", {}) or {}
    sym = snap["currency_symbol"]

    # month-over-month from entries
    entries = await db.entries.find({"user_id": uid, "company_id": cid}, {"type": 1, "amount": 1, "date": 1}).to_list(5000) if cid else []
    now = datetime.now(timezone.utc)
    this_k = now.strftime("%Y-%m")
    prev = (now.replace(day=1) - timedelta(days=1))
    prev_k = prev.strftime("%Y-%m")
    def agg(k, t):
        return sum(e["amount"] for e in entries if e["type"] == t and str(e.get("date", "")).startswith(k))
    inc_t, exp_t = agg(this_k, "income"), agg(this_k, "expense")
    inc_p, exp_p = agg(prev_k, "income"), agg(prev_k, "expense")
    def pct(a, b):
        return round((a - b) / b * 100) if b > 0 else None
    exp_chg, inc_chg = pct(exp_t, exp_p), pct(inc_t, inc_p)
    margin_t = round((inc_t - exp_t) / inc_t * 100, 1) if inc_t > 0 else None
    margin_p = round((inc_p - exp_p) / inc_p * 100, 1) if inc_p > 0 else None

    m_net = snap["monthly_net"]; cash = snap["cash_balance"]
    runway_days = round(cash / (abs(m_net) / 30)) if m_net < 0 and cash > 0 else None
    annual_income = snap["total_income"]
    price_uplift_profit = round(annual_income * 0.04) if annual_income > 0 else None
    big_pct = prof.get("biggest_client_pct")
    client_loss = round(inc_t * (big_pct / 100)) if big_pct and inc_t > 0 else None
    debt = prof.get("debt")

    facts = {
        "moeda": sym,
        "saldo_atual": cash,
        "resultado_mensal": m_net,
        "runway_dias_ate_negativo": runway_days,
        "despesas_variacao_pct_vs_mes_anterior": exp_chg,
        "receitas_variacao_pct_vs_mes_anterior": inc_chg,
        "margem_este_mes_pct": margin_t,
        "margem_mes_anterior_pct": margin_p,
        "lucro_extra_anual_se_subir_precos_4pct": price_uplift_profit,
        "peso_maior_cliente_pct": big_pct,
        "perda_mensal_se_perder_maior_cliente": client_loss,
        "dividas": debt,
        "dependencia_fundador": prof.get("founder_dependency"),
        "dependencia_fornecedor": prof.get("supplier_dependency"),
        "saude_0_100": snap["health"],
    }
    facts = {k: v for k, v in facts.items() if v not in (None, "")}

    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        "Transforma estes FACTOS em ALERTAS de decisão, no estilo de um Diretor Executivo. "
        "NÃO descrevas dashboards — cada alerta é uma frase curta, afiada e QUANTIFICADA (com € ou %), "
        "que diz a consequência ou a decisão. Exemplos do tom: 'A tesouraria fica negativa em 43 dias.', "
        "'As despesas subiram 18% face ao mês passado.', 'Se subires os preços 4%, o lucro anual sobe " + sym + "62.000.'. "
        "Devolve APENAS JSON: {\"signals\":[{\"type\":\"critical\"|\"attention\"|\"positive\"|\"risk\"|\"opportunity\",\"text\":str,\"detail\":str}],"
        "\"priority\":{\"text\":str,\"why\":str}}. "
        "Regras: usa SÓ os números presentes nos FACTOS (ou aritmética simples a partir deles); NUNCA inventes números. "
        "Se um facto não existir, omite esse alerta. Dá entre 3 e 6 sinais, variando os tipos (inclui pelo menos 1 positivo se os dados permitirem e 1 oportunidade). "
        "'detail' = 1 frase a explicar. 'priority' = a ação nº1 de hoje, concreta. Português europeu. Sem texto fora do JSON.\n\n"
        "FACTOS:\n" + json.dumps(facts, ensure_ascii=False)
    )
    data = await cached_ai("signals", uid, cid, sysmsg, prompt) or {"signals": [], "priority": {}}
    allowed = await can_access_premium(user)
    priority = data.get("priority", {}) if allowed else {}
    return {
        "user_name": user.get("name", ""),
        "count": len(data.get("signals", [])),
        "signals": data.get("signals", []),
        "priority": priority,
        "premium_locked": not allowed,
        "has_data": snap["total_income"] > 0 or snap["total_expense"] > 0,
    }
