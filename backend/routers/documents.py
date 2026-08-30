from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *
from core import _growth_score

router = APIRouter()

# ---------------------------------------------------------------- Investment Grade (PREMIUM)
def to_grade(score: float) -> str:
    for th, g in [(95, "A+"), (88, "A"), (82, "A-"), (75, "B+"), (68, "B"), (62, "B-"),
                  (55, "C+"), (48, "C"), (40, "C-"), (30, "D")]:
        if score >= th:
            return g
    return "F"

@router.get("/investment-grade")
async def investment_grade(user: dict = Depends(get_current_user)):
    if not await can_access_premium(user):
        raise HTTPException(status_code=402, detail="premium_required")
    snap = await build_snapshot(user["id"])
    company = await resolve_company(user["id"]) or {}
    cid = str(company["_id"]) if company.get("_id") else None
    entries = await db.entries.find({"user_id": user["id"], "company_id": cid}, {"type": 1, "amount": 1, "date": 1}).to_list(5000) if cid else []
    dna = await db.ceo_dna.find_one({"user_id": user["id"]}) or {}
    docs = await db.documents.find({"user_id": user["id"], "is_deleted": False}).to_list(500)
    doc_types = set(d.get("doc_type", "other") for d in docs)
    n_docs = len(docs)
    # Document AI insights — only count categories the AI actually verified as relevant
    verified_types = set(); figures = {}; insights = []
    for d in docs:
        a = d.get("analysis") or {}
        if a.get("relevant") and a.get("quality") in ("high", "medium"):
            verified_types.add(d.get("doc_type", "other"))
        for k, v in (a.get("figures") or {}).items():
            if isinstance(v, (int, float)) and v and k not in figures:
                figures[k] = v
        if a.get("summary"):
            insights.append({"filename": d.get("original_filename"), "doc_type": d.get("doc_type", "other"),
                             "quality": a.get("quality"), "relevant": bool(a.get("relevant")), "summary": a.get("summary")})

    inc, months_set = {}, set()
    for e in entries:
        mk = str(e.get("date", ""))[:7]
        if len(mk) == 7:
            months_set.add(mk)
            if e["type"] == "income":
                inc[mk] = inc.get(mk, 0) + e["amount"]
    sorted_m = sorted(inc.keys())
    growth_score = 50
    if len(sorted_m) >= 2:
        recent = sum(inc[m] for m in sorted_m[-3:])
        prior = sum(inc[m] for m in sorted_m[-6:-3])
        if prior > 0:
            growth_score = max(5, min(100, int(60 + ((recent - prior) / prior) * 100)))
        elif recent > 0:
            growth_score = 72
    coverage = len(months_set)
    emp = int(company.get("employees_count", 0)); cli = int(company.get("clients_count", 0))
    dependency_score = min(100, 28 + emp * 12 + (12 if cli > 5 else 0))
    liquidity_score = min(100, int(snap["runway"] * 14))
    risk_score = min(100, int(snap["runway"] * 12 + (20 if snap["profit_margin"] > 0 else 0)))
    fin_score = snap["health"]

    dims = [
        {"key": "financeiro", "label": "Financeiro", "score": fin_score},
        {"key": "crescimento", "label": "Crescimento", "score": growth_score},
        {"key": "risco", "label": "Risco", "score": risk_score},
        {"key": "liquidez", "label": "Liquidez", "score": liquidity_score},
        {"key": "dependencia", "label": "Dependência do Fundador", "score": dependency_score},
    ]
    for d in dims:
        d["grade"] = to_grade(d["score"])
    overall_score = round(sum(d["score"] for d in dims) / len(dims))
    overall_grade = to_grade(overall_score)

    checklist = [
        {"item": "Demonstrações financeiras completas", "upload_type": "financials", "done": "financials" in verified_types},
        {"item": "Histórico de EBITDA e fluxo de caixa (6+ meses)", "done": coverage >= 6 or bool(figures.get("ebitda"))},
        {"item": "Composição de ativos e passivos", "upload_type": "assets", "done": "assets" in verified_types or bool(figures.get("assets"))},
        {"item": "Contratos e qualidade da carteira de clientes", "upload_type": "contracts", "done": ("contracts" in verified_types) or cli > 0},
        {"item": "Avaliação de dependência do fundador", "done": bool(dna.get("completed")) and emp > 0},
    ]
    done = sum(1 for c in checklist if c["done"])
    completeness = round(done / len(checklist) * 100)
    has_real_financials = ("financials" in verified_types) and any(figures.get(k) for k in ("revenue", "ebitda", "net_profit"))
    if completeness >= 75 and has_real_financials:
        tier, margin = "Nível Profissional", 0.10
    elif completeness >= 40:
        tier, margin = "Estimativa Fundamentada", 0.20
    else:
        tier, margin = "Estimativa Inteligente", 0.35
    value = snap["company_value"]
    value_range = {"low": round(value * (1 - margin)), "high": round(value * (1 + margin))}
    next_target = round(value * 1.4) if value else snap["goal_value"]
    sym = snap["currency_symbol"]

    sysmsg = await build_system_prompt(user["id"], user.get("name", ""))
    grades_txt = ", ".join(f"{d['label']}: {d['grade']}" for d in dims)
    docs_block = ""
    if insights:
        lines = [f"- {i['filename']} [{i['doc_type']}, qualidade {i['quality']}]: {i['summary']}" for i in insights[:12]]
        docs_block = "\n\nDOCUMENTOS ANALISADOS PELA IA (usa estes dados reais na tua análise):\n" + "\n".join(lines)
        if figures:
            docs_block += "\nNúmeros extraídos dos documentos: " + json.dumps(figures, ensure_ascii=False)
    prompt = (
        f"Estás a produzir um RELATÓRIO DE INVESTIMENTO estilo agência de rating para esta empresa. "
        f"Valor estimado atual: {sym}{value} (intervalo {sym}{value_range['low']}–{sym}{value_range['high']}). "
        f"Rating global: {overall_grade}. Notas: {grades_txt}. "
        f"Nível de confiança dos dados: {tier} ({completeness}% completos).{docs_block} "
        f"Devolve APENAS JSON: {{\"rationale\":str, \"grade_notes\":{{\"financeiro\":str,\"crescimento\":str,\"risco\":str,\"liquidez\":str,\"dependencia\":str}}, "
        f"\"improvement_plan\":[{{\"action\":str,\"impact\":str}}], \"disclaimer\":str}}. "
        f"'rationale': explica em 2-3 frases PORQUE a empresa vale este valor, referindo os números reais dos documentos quando existam. "
        f"'grade_notes': 1 frase curta por dimensão a justificar a nota. "
        f"'improvement_plan': 3-4 ações concretas e priorizadas para subir o valor até {sym}{next_target}, cada uma com o impacto estimado. "
        f"'disclaimer': 1 frase — se o nível for 'Nível Profissional', diz que a avaliação foi fundamentada em documentos financeiros analisados; caso contrário, esclarece que é uma estimativa e não uma avaliação pericial oficial. "
        f"Tudo em português. Sem texto fora do JSON."
    )
    ai = await ai_json(sysmsg, prompt, model="gemini-3.7-flash") or {}
    notes = ai.get("grade_notes", {})
    fallback_why = {
        "financeiro": "Baseado na saúde financeira e margem de lucro atuais.",
        "crescimento": "Baseado na tendência de receita e na base de clientes.",
        "risco": "Baseado na autonomia de caixa e na rentabilidade.",
        "liquidez": "Baseado no saldo disponível face às despesas mensais.",
        "dependencia": "Baseado na estrutura de equipa e na maturidade operacional.",
    }
    for d in dims:
        d["why"] = notes.get(d["key"]) or fallback_why.get(d["key"], "")

    return {
        "overall_grade": overall_grade, "overall_score": overall_score,
        "dimensions": dims, "company_value": value, "value_range": value_range,
        "currency_symbol": sym, "next_target": next_target,
        "confidence": {"tier": tier, "score": completeness, "checklist": checklist},
        "documents_analyzed": len(insights),
        "document_insights": insights,
        "extracted_figures": figures,
        "rationale": ai.get("rationale", "Estimativa baseada nos dados financeiros e no perfil da empresa fornecidos."),
        "improvement_plan": ai.get("improvement_plan", []),
        "disclaimer": ai.get("disclaimer", "Esta é uma estimativa fundamentada nos dados fornecidos e nos documentos analisados, não uma avaliação pericial oficial."),
    }

# ---------------------------------------------------------------- docs
FIN_HINTS = ("balancete", "ies", "modelo 22", "modelo22", "balanco", "balanço", "demonstra", "resultados", "iva", "snc", "declaracao", "declaração")

async def store_and_analyze(user_id: str, filename: str, content_type: str, data: bytes, doc_type: str = "report"):
    ext = filename.split(".")[-1] if "." in (filename or "") else "bin"
    path = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type or "application/octet-stream")
    analysis = {}
    try:
        text = extract_document_text(data, content_type, filename)
        analysis = await analyze_document(text, doc_type, filename)
    except Exception as e:
        logger.error(f"doc analysis failed: {e}")
    name = (filename or "").lower()
    is_financial = doc_type in ("report", "financial") or any(h in name for h in FIN_HINTS)
    if is_financial:
        try:
            fin = await extract_financial_document(data, content_type, filename)
            if fin and isinstance(fin.get("totals"), dict):
                t = fin["totals"]
                figs = {"revenue": t.get("vendas_e_servicos"), "ebitda": t.get("ebitda"),
                        "net_profit": t.get("resultado_liquido"), "assets": t.get("ativo_total"),
                        "liabilities": t.get("passivo_total"), "equity": t.get("capital_proprio"),
                        "currency": fin.get("currency", "EUR")}
                figs = {k: v for k, v in figs.items() if v is not None}
                if figs:
                    analysis["figures"] = figs
                    analysis["relevant"] = True
                    analysis["quality"] = "high"
                    analysis["doc_kind"] = fin.get("doc_type")
                    analysis["reconciled"] = fin.get("reconciled")
                    if fin.get("summary"):
                        analysis["summary"] = fin["summary"]
                year = fin.get("year")
                if year:
                    cid = await active_company_id(user_id)
                    await db.financial_extractions.update_one(
                        {"user_id": user_id, "company_id": cid, "year": int(year), "doc_type": fin.get("doc_type", "outro")},
                        {"$set": {"user_id": user_id, "company_id": cid, "year": int(year), "doc_type": fin.get("doc_type", "outro"),
                                  **{k: v for k, v in t.items() if v is not None}, "currency": fin.get("currency", "EUR"),
                                  "reconciled": fin.get("reconciled"), "reconciliation_diff": fin.get("reconciliation_diff"),
                                  "summary": fin.get("summary"), "lines": (fin.get("lines") or [])[:250],
                                  "filename": filename, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
                    existing = await db.financial_profiles.find_one({"user_id": user_id, "company_id": cid})
                    if not existing:
                        rev = t.get("vendas_e_servicos"); ass = t.get("ativo_total"); lia = t.get("passivo_total")
                        await db.financial_profiles.insert_one({
                            "user_id": user_id, "company_id": cid,
                            "monthly_revenue": round((rev or 0) / 12, 2), "cash_balance": 0.0,
                            "variable_costs_pct": 0.0, "fixed_costs": [],
                            "assets": ([{"name": f"Ativo total (Balancete {int(year)})", "amount": ass}] if ass else []),
                            "liabilities": ([{"name": f"Passivo total (Balancete {int(year)})", "amount": lia}] if lia else []),
                            "source": "auto_extraction", "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            logger.error(f"financial extraction failed: {e}")
    res = await db.documents.insert_one({"user_id": user_id, "storage_path": result["path"],
        "original_filename": filename, "content_type": content_type, "doc_type": doc_type,
        "analysis": analysis, "size": result.get("size", len(data)), "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()})
    await invalidate_ai_cache(user_id)
    return res.inserted_id, analysis

@router.post("/upload")
async def upload(file: UploadFile = File(...), doc_type: str = Form("other"), user: dict = Depends(get_current_user)):
    data = await file.read()
    _id, analysis = await store_and_analyze(user["id"], file.filename, file.content_type, data, doc_type)
    return {"id": str(_id), "filename": file.filename, "doc_type": doc_type, "size": len(data),
            "analysis": {"relevant": analysis.get("relevant"), "quality": analysis.get("quality"), "summary": analysis.get("summary")}}

@router.get("/documents")
async def list_docs(user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"user_id": user["id"], "is_deleted": False}).sort("created_at", -1).to_list(500)
    return [{"id": str(d["_id"]), "filename": d.get("original_filename"), "doc_type": d.get("doc_type", "other"),
             "size": d.get("size", 0), "created_at": d.get("created_at"),
             "analysis": {"relevant": (d.get("analysis") or {}).get("relevant"),
                          "quality": (d.get("analysis") or {}).get("quality"),
                          "summary": (d.get("analysis") or {}).get("summary")}} for d in docs]

@router.delete("/documents/{doc_id}")
async def delete_doc(doc_id: str, user: dict = Depends(get_current_user)):
    await db.documents.update_one({"_id": ObjectId(doc_id), "user_id": user["id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@router.get("/financial-history")
async def financial_history(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    rows = await db.financial_extractions.find({"user_id": user["id"], "company_id": cid}).sort("year", 1).to_list(100)
    keys = ["ativo_total", "ativo_nao_corrente", "ativo_corrente", "passivo_total", "capital_proprio",
            "vendas_e_servicos", "rendimentos_totais", "gastos_totais", "resultado_liquido", "ebitda"]
    years = {}
    for r in rows:
        y = r.get("year")
        if not y:
            continue
        yd = years.setdefault(y, {"year": y})
        for k in keys:
            if r.get(k) is not None:
                yd[k] = r[k]
        yd["reconciled"] = r.get("reconciled")
        yd["reconciliation_diff"] = r.get("reconciliation_diff")
        yd["doc_type"] = r.get("doc_type")
    return {"years": sorted(years.values(), key=lambda x: x["year"]), "keys": keys, "currency_symbol": "€"}

@router.get("/report-inbox")
async def report_inbox(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])})
    token = (u or {}).get("report_token")
    if not token:
        token = secrets.token_urlsafe(9).replace("_", "").replace("-", "")[:12].lower() or uuid.uuid4().hex[:12]
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"report_token": token}})
    domain = os.environ.get("REPORT_INBOUND_DOMAIN", "")
    return {"token": token, "address": (f"relatorios+{token}@{domain}" if domain else ""), "active": bool(domain)}

@router.post("/inbound/report")
async def inbound_report(request: Request):
    import re
    secret = os.environ.get("INBOUND_SECRET")
    if secret and request.query_params.get("secret") != secret and request.headers.get("x-inbound-secret") != secret:
        raise HTTPException(status_code=401, detail="unauthorized")
    form = await request.form()
    recipient = str(form.get("to") or form.get("recipient") or form.get("envelope") or form.get("received_for") or "")
    m = re.search(r"relatorios\+([^@\s\"']+)@", recipient, re.I)
    if not m:
        raise HTTPException(status_code=400, detail="token not found in recipient")
    token = m.group(1).lower()
    u = await db.users.find_one({"report_token": token})
    if not u:
        raise HTTPException(status_code=404, detail="unknown token")
    uid = str(u["_id"])
    stored = 0
    for _key, val in form.multi_items():
        if hasattr(val, "filename") and val.filename:
            data = await val.read()
            if data:
                await store_and_analyze(uid, val.filename, getattr(val, "content_type", "application/octet-stream"), data, "report")
                stored += 1
    return {"ok": True, "stored": stored}
