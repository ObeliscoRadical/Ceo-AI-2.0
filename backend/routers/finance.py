from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import StreamingResponse
from core import *
from models import *

router = APIRouter()

@router.get("/dna")
async def get_dna(user: dict = Depends(get_current_user)):
    d = await db.ceo_dna.find_one({"user_id": user["id"]})
    if not d:
        return {"completed": False}
    d["id"] = str(d["_id"]); d.pop("_id")
    return d

@router.post("/dna")
async def save_dna(inp: DNAInput, user: dict = Depends(get_current_user)):
    data = inp.model_dump()
    data.update({"user_id": user["id"], "completed": True})
    await db.ceo_dna.update_one({"user_id": user["id"]}, {"$set": data}, upsert=True)
    await db.settings.update_one({"user_id": user["id"]}, {"$set": {"ceo_mode": inp.ceo_mode}}, upsert=True)
    mems = []
    if inp.dream: mems.append(("sonho", inp.dream))
    if inp.target_revenue: mems.append(("objetivo", f"Quer faturar {inp.target_revenue}"))
    if inp.five_year_vision: mems.append(("visao", inp.five_year_vision))
    for cat, content in mems:
        await db.memories.update_one({"user_id": user["id"], "category": cat},
                                     {"$set": {"content": content, "user_id": user["id"], "category": cat,
                                               "created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"completed": True}

# ---------------------------------------------------------------- entries
@router.get("/entries")
async def list_entries(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    entries = await db.entries.find({"user_id": user["id"], "company_id": cid}).sort("date", -1).to_list(2000)
    for e in entries:
        e["id"] = str(e["_id"]); e.pop("_id")
    return entries

@router.post("/entries")
async def create_entry(inp: EntryInput, user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    data = inp.model_dump()
    data.update({"user_id": user["id"], "company_id": cid, "created_at": datetime.now(timezone.utc).isoformat()})
    res = await db.entries.insert_one(data)
    await invalidate_ai_cache(user["id"])
    return {"id": str(res.inserted_id), **inp.model_dump()}

@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    await db.entries.delete_one({"_id": ObjectId(entry_id), "user_id": user["id"]})
    await invalidate_ai_cache(user["id"])
    return {"ok": True}

@router.post("/entries/import")
async def import_csv(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    raw = (await file.read()).decode("utf-8", errors="ignore")
    prompt = (
        "Analisa este ficheiro CSV/Excel de dados financeiros e devolve APENAS um array JSON válido. "
        "Cada objeto: {\"type\":\"income\"|\"expense\",\"category\":str,\"amount\":number,\"date\":\"YYYY-MM-DD\",\"description\":str}. "
        "Interpreta colunas em qualquer idioma. Valores negativos ou palavras como despesa/custo/pagamento => expense; "
        "receita/venda/entrada => income. Não incluas texto fora do JSON.\n\nCSV:\n" + raw[:6000]
    )
    sysmsg = "És um analista financeiro que estrutura dados. Respondes só com JSON."
    rows = await ai_json(sysmsg, prompt, model="gemini-3.7-flash")
    if rows is None:
        raise HTTPException(status_code=422, detail="Não foi possível interpretar o ficheiro")
    inserted = 0
    for r in rows if isinstance(rows, list) else []:
        try:
            await db.entries.insert_one({"user_id": user["id"], "company_id": cid,
                "type": r.get("type", "expense"), "category": str(r.get("category", "Outro")),
                "amount": float(r.get("amount", 0)), "date": str(r.get("date", datetime.now(timezone.utc).date().isoformat())),
                "description": str(r.get("description", "")), "created_at": datetime.now(timezone.utc).isoformat()})
            inserted += 1
        except Exception:
            continue
    await invalidate_ai_cache(user["id"])
    return {"imported": inserted}

# ---------------------------------------------------------------- mock bank connect
@router.post("/bank/connect")
async def bank_connect(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    if not cid:
        raise HTTPException(status_code=400, detail="Cria uma empresa primeiro")
    now = datetime.now(timezone.utc)
    cats_in = ["Vendas", "Serviços", "Consultoria", "Subscrições"]
    cats_out = ["Salários", "Renda", "Fornecedores", "Marketing", "Software", "Impostos"]
    created = 0
    for m in range(6):
        d = (now - timedelta(days=30 * m))
        for _ in range(random.randint(3, 5)):
            await db.entries.insert_one({"user_id": user["id"], "company_id": cid, "type": "income",
                "category": random.choice(cats_in), "amount": round(random.uniform(1500, 9000), 2),
                "date": d.replace(day=random.randint(1, 28)).date().isoformat(),
                "description": "Movimento bancário (demo)", "created_at": now.isoformat()})
            created += 1
        for _ in range(random.randint(3, 6)):
            await db.entries.insert_one({"user_id": user["id"], "company_id": cid, "type": "expense",
                "category": random.choice(cats_out), "amount": round(random.uniform(400, 5000), 2),
                "date": d.replace(day=random.randint(1, 28)).date().isoformat(),
                "description": "Movimento bancário (demo)", "created_at": now.isoformat()})
            created += 1
    await db.companies.update_one({"_id": ObjectId(cid)}, {"$set": {"bank_connected": True}})
    await invalidate_ai_cache(user["id"])
    return {"connected": True, "imported": created}

@router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    snap = await build_snapshot(user["id"])
    cid = await active_company_id(user["id"])
    await record_equity(user["id"], cid, snap)
    return snap

MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

@router.get("/equity-history")
async def equity_history(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    rows = await get_equity_history(user["id"], cid)
    company = await resolve_company(user["id"]) or {}
    sym = CURRENCY_SYMBOL.get(company.get("currency", "EUR"), "€")
    points = [{"month": MONTH_ABBR[int(r["month"][5:7]) - 1], "net_worth": r.get("net_worth", 0)} for r in rows]
    delta = round(points[-1]["net_worth"] - points[-2]["net_worth"], 2) if len(points) >= 2 else None
    return {"points": points, "delta": delta, "currency_symbol": sym}

@router.get("/value-alert")
async def value_alert(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    return await compute_value_alert(user["id"], cid)

@router.post("/value-alert/email")
async def value_alert_email(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    alert = await compute_value_alert(user["id"], cid)
    if not alert.get("has_alert"):
        raise HTTPException(status_code=400, detail="Ainda não há variação de valor para enviar. É preciso pelo menos 2 meses de dados.")
    u = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not u or not u.get("email"):
        raise HTTPException(status_code=400, detail="Esta conta não tem email associado")
    html = build_value_alert_html(u.get("name", ""), alert, os.environ.get("FRONTEND_URL", ""))
    subj = ("O valor da tua empresa subiu este mês — CEO AI 2.0" if alert["direction"] == "up"
            else "O valor da tua empresa mudou este mês — CEO AI 2.0")
    ok = await send_email_raw(u["email"], subj, html)
    if not ok:
        raise HTTPException(status_code=502, detail="Não foi possível enviar o email")
    return {"ok": True, "to": u["email"]}

# ---------------------------------------------------------------- CEO Score
@router.get("/score")
async def ceo_score(user: dict = Depends(get_current_user)):
    snap = await build_snapshot(user["id"])
    dna = await db.ceo_dna.find_one({"user_id": user["id"]}) or {}
    company = await resolve_company(user["id"]) or {}
    cid = str(company["_id"]) if company.get("_id") else None
    n_entries = await db.entries.count_documents({"user_id": user["id"], "company_id": cid}) if cid else 0
    dims = [
        {"dimension": "Liderança", "score": 80 if dna.get("completed") else 40},
        {"dimension": "Financeiro", "score": snap["health"]},
        {"dimension": "Marketing", "score": min(100, 30 + company.get("clients_count", 0) * 4)},
        {"dimension": "Operação", "score": 70 if n_entries else 35},
        {"dimension": "Clientes", "score": min(100, 40 + company.get("clients_count", 0) * 5)},
        {"dimension": "Funcionários", "score": min(100, 50 + company.get("employees_count", 0) * 6)},
        {"dimension": "Risco", "score": min(100, int(snap["runway"] * 12))},
        {"dimension": "Inovação", "score": 60 if dna.get("five_year_vision") else 30},
    ]
    overall = round(sum(d["score"] for d in dims) / len(dims))
    return {"overall": overall, "dimensions": dims}


# ---------------------------------------------------------------- financial profile
def compute_profile_metrics(p: dict, target_annual: float = 0):
    revenue = float(p.get("monthly_revenue", 0) or 0)
    fixed = [{"name": (c.get("name") or "Custo"), "amount": float(c.get("amount", 0) or 0)}
             for c in (p.get("fixed_costs") or [])]
    total_fixed = sum(c["amount"] for c in fixed)
    var_pct = max(0.0, min(100.0, float(p.get("variable_costs_pct", 0) or 0)))
    var_value = revenue * var_pct / 100.0
    total_costs = total_fixed + var_value
    profit = revenue - total_costs
    margin_pct = (profit / revenue * 100.0) if revenue > 0 else 0.0
    cm_ratio = 1.0 - var_pct / 100.0
    break_even = (total_fixed / cm_ratio) if cm_ratio > 0 and total_fixed > 0 else 0.0
    burn = max(0.0, total_costs - revenue)
    cash = float(p.get("cash_balance", 0) or 0)
    runway = (cash / burn) if burn > 0 else None
    biggest = max(fixed, key=lambda c: c["amount"], default=None)
    debt = float(p.get("total_debt", 0) or 0)
    net_position = cash - debt
    debt_revenue_months = (debt / revenue) if revenue > 0 and debt > 0 else None
    assets = [{"name": (a.get("name") or "Ativo"), "amount": float(a.get("amount", 0) or 0)} for a in (p.get("assets") or [])]
    liabilities = [{"name": (l.get("name") or "Passivo"), "amount": float(l.get("amount", 0) or 0)} for l in (p.get("liabilities") or [])]
    _bal = compute_balance({}, {"cash_balance": cash, "assets": assets, "liabilities": liabilities, "total_debt": debt}, 0)
    total_assets = _bal["total_assets"]
    total_liabilities = _bal["total_liabilities"]
    net_worth = _bal["net_worth"]
    target_month = (target_annual / 12.0) if target_annual else 0.0
    gap = (target_month - revenue) if target_month else 0.0
    gap_pct = (revenue / target_month * 100.0) if target_month > 0 else 0.0
    return {
        "monthly_revenue": round(revenue, 2), "fixed_costs": fixed,
        "total_fixed": round(total_fixed, 2), "variable_costs_pct": round(var_pct, 1),
        "variable_costs_value": round(var_value, 2), "total_costs": round(total_costs, 2),
        "profit": round(profit, 2), "margin_pct": round(margin_pct, 1),
        "break_even_revenue": round(break_even, 2), "cash_balance": round(cash, 2),
        "runway_months": (round(runway, 1) if runway is not None else None),
        "biggest_cost": biggest, "target_revenue_month": round(target_month, 2),
        "target_gap": round(gap, 2), "target_progress_pct": round(min(100.0, gap_pct), 1),
        "total_debt": round(debt, 2), "net_position": round(net_position, 2),
        "debt_revenue_months": (round(debt_revenue_months, 1) if debt_revenue_months is not None else None),
        "assets": assets, "liabilities": liabilities,
        "total_assets": round(total_assets, 2), "total_liabilities": round(total_liabilities, 2),
        "net_worth": round(net_worth, 2),
    }

async def _profile_target(uid):
    dna = await db.ceo_dna.find_one({"user_id": uid}) or {}
    return float(dna.get("target_revenue", 0) or 0)

@router.get("/finance/profile")
async def get_finance_profile(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    raw = await db.financial_profiles.find_one({"user_id": user["id"], "company_id": cid}) or {}
    erp_ctx = await get_erp_financial_context(user["id"], cid)
    p, source_label = merge_financial_profile(raw, erp_ctx)
    company = await resolve_company(user["id"]) or {}
    target = await _profile_target(user["id"])
    metrics = compute_profile_metrics(p, target)
    exists = bool(any([
        p.get("monthly_revenue"), p.get("cash_balance"), p.get("total_debt"),
        p.get("fixed_costs"), p.get("assets"), p.get("liabilities")
    ]))
    return {"exists": exists, "currency": company.get("currency", "EUR"),
            "source_label": source_label or "os teus dados (Perfil Financeiro)",
            "has_external_context": bool(erp_ctx), **metrics}

@router.post("/finance/profile")
async def save_finance_profile(inp: FinancialProfileInput, user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    if not cid:
        raise HTTPException(status_code=400, detail="Cria uma empresa primeiro")
    data = inp.model_dump()
    data.update({"user_id": user["id"], "company_id": cid, "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.financial_profiles.update_one({"user_id": user["id"], "company_id": cid}, {"$set": data}, upsert=True)
    m = compute_profile_metrics(data)
    await db.memories.update_one({"user_id": user["id"], "category": "financas_perfil"},
        {"$set": {"user_id": user["id"], "category": "financas_perfil",
                  "content": (f"Faturamento mensal {m['monthly_revenue']}, custos totais {m['total_costs']}, "
                              f"lucro {m['profit']} ({m['margin_pct']}% margem), caixa {m['cash_balance']}, "
                              f"divida total {m['total_debt']}, posicao liquida {m['net_position']}, "
                              f"ponto de equilibrio {m['break_even_revenue']}, patrimonio liquido {m['net_worth']} "
                              f"(ativos {m['total_assets']}, passivos {m['total_liabilities']})."),
                  "created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    await invalidate_ai_cache(user["id"])
    _val = compute_valuation(data, {"net_worth": m["net_worth"], "cash": m["cash_balance"]})
    await record_equity(user["id"], cid, {"has_balance": True, "net_worth": m["net_worth"],
                                          "total_assets": m["total_assets"], "total_liabilities": m["total_liabilities"],
                                          "company_value": _val["value"]})
    return {"ok": True}

@router.get("/finance/profile/analysis")
async def finance_profile_analysis(user: dict = Depends(get_current_user)):
    cid = await active_company_id(user["id"])
    raw = await db.financial_profiles.find_one({"user_id": user["id"], "company_id": cid}) or {}
    erp_ctx = await get_erp_financial_context(user["id"], cid)
    p, source_label = merge_financial_profile(raw, erp_ctx)
    if not p or not any([
        p.get("monthly_revenue"), p.get("cash_balance"), p.get("total_debt"),
        p.get("fixed_costs"), p.get("assets"), p.get("liabilities")
    ]):
        return {"empty": True, "premium_locked": False, "analysis": None}
    target = await _profile_target(user["id"])
    m = compute_profile_metrics(p, target)
    if not await can_access_premium(user):
        return {"empty": False, "premium_locked": True, "metrics": m, "analysis": None}
    company = await resolve_company(user["id"]) or {}
    cur = company.get("currency", "EUR")
    system = ("Es um CEO e consultor executivo experiente. Analisas numeros reais de uma PME e "
              "respondes como um socio, sem jargao tecnico. Responde SEMPRE em JSON valido.")
    prompt = (
        f"Empresa: {company.get('name','')}. Setor: {company.get('sector','') or 'n/d'}. Moeda: {cur}.\n"
        f"Faturamento mensal: {m['monthly_revenue']}\n"
        f"Custos fixos ({m['total_fixed']}): {json.dumps(m['fixed_costs'], ensure_ascii=False)}\n"
        f"Custos variaveis: {m['variable_costs_pct']}% = {m['variable_costs_value']}\n"
        f"Custos totais: {m['total_costs']} | Lucro mensal: {m['profit']} | Margem: {m['margin_pct']}%\n"
        f"Ponto de equilibrio (faturamento): {m['break_even_revenue']}\n"
        f"Saldo em caixa: {m['cash_balance']} | Runway: {m['runway_months']} meses\n"
        f"Divida total (emprestimos/financiamentos): {m['total_debt']} | Posicao liquida (caixa menos divida): {m['net_position']}\n"
        f"Ativos totais: {m['total_assets']} (caixa + {json.dumps(m['assets'], ensure_ascii=False)})\n"
        f"Passivos totais: {m['total_liabilities']} (divida + {json.dumps(m['liabilities'], ensure_ascii=False)})\n"
        f"Patrimonio liquido (ativos menos passivos): {m['net_worth']}\n"
        f"Fonte ativa destes dados: {source_label or 'os teus dados (Perfil Financeiro)'}\n"
        f"Meta de faturamento mensal: {m['target_revenue_month']} | Progresso: {m['target_progress_pct']}%\n\n"
        "Devolve JSON: {\"diagnostico\": string (2-3 frases, direto), "
        "\"riscos\": [ate 3 strings], \"prioridades\": [ate 3 strings], "
        "\"acoes\": [ate 3 objetos {\"titulo\": string, \"impacto\": string}]}"
    )
    payload = await cached_ai("profile_analysis", user["id"], cid, system, prompt)
    return {"empty": False, "premium_locked": False, "metrics": m, "analysis": payload}


