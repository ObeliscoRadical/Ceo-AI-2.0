from fastapi import APIRouter, Depends, HTTPException
from core import *
from models import *
import math
import uuid

router = APIRouter()


def _parse_date(s: str):
    if not s:
        return None
    s = s.strip()
    if len(s) == 7:  # YYYY-MM
        s = s + "-01"
    try:
        return datetime.fromisoformat(s[:10]).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _years_left(g: dict, now: datetime) -> float:
    if g.get("deadline_type") == "date" and g.get("deadline_date"):
        d = _parse_date(g["deadline_date"])
        if d:
            return max(0.25, round((d - now).days / 365.25, 2))
    return max(0.25, float(g.get("deadline_years") or 5))


def _viability(req_growth_annual, current_margin, assumed_margin, has_debt_pressure):
    """Classificação honesta de probabilidade (verde/amarelo/vermelho)."""
    if req_growth_annual is None:
        return {"level": "amber", "label": "Cenário exigente", "note": "Faltam dados para avaliar com rigor."}
    score = 0
    if req_growth_annual <= 15: score += 2
    elif req_growth_annual <= 35: score += 1
    if current_margin is not None and assumed_margin is not None and (assumed_margin - current_margin) <= 5: score += 1
    if not has_debt_pressure: score += 1
    if score >= 3:
        return {"level": "green", "label": "Cenário possível", "note": "Realista com a estrutura atual, mantendo disciplina."}
    if score >= 1:
        return {"level": "amber", "label": "Cenário exigente", "note": "Alcançável, mas exige melhorar margem e/ou crescer bem acima do ritmo atual."}
    return {"level": "red", "label": "Cenário altamente ambicioso", "note": "Pouco provável com a estrutura atual sem uma mudança profunda."}


def _obstacle(current_margin, current_revenue, req_revenue, has_debt_pressure):
    """Principal obstáculo identificado -> mensagem dinâmica."""
    if current_margin is None or current_margin <= 0:
        return "margem", "A margem atual é baixa ou negativa. A prioridade é tornar a empresa rentável antes de acelerar a faturação."
    if current_margin < 8:
        return "margem", "A margem líquida é baixa. Ganhar rentabilidade vale mais do que faturar mais ao mesmo custo."
    if req_revenue and current_revenue and current_revenue > 0 and req_revenue > current_revenue * 1.8:
        return "faturacao", "A faturação atual está muito abaixo do necessário. É preciso crescer as vendas de forma significativa."
    if has_debt_pressure:
        return "divida", "A dívida pesa no valor da empresa. Reduzir passivos liberta valor mais depressa do que crescer."
    return "crescimento", "O caminho passa sobretudo por manter o crescimento e proteger a margem ano após ano."


async def _compute_projection(uid: str, cid):
    """Cálculos 100% determinísticos no backend (a IA nunca inventa números).
    A META é o VALOR DA EMPRESA (não faturação). Faz engenharia inversa do desempenho
    necessário usando o motor de avaliação central."""
    snap = await build_snapshot(uid)
    sym = snap["currency_symbol"]
    val = snap.get("valuation", {}) or {}
    company = await resolve_company(uid) or {}
    sector = (company.get("profile") or {}).get("sector") or (company.get("profile") or {}).get("activity") or company.get("sector")

    current_value = float(snap.get("company_value", 0) or 0)
    net_worth = float(snap.get("net_worth", 0) or 0)
    cash = float(snap.get("cash_available", 0) or 0)
    total_liab = float(snap.get("total_liabilities", 0) or 0)
    current_revenue = val.get("annual_revenue")
    current_profit = val.get("annual_profit")
    current_margin = None
    if current_revenue and current_revenue > 0 and isinstance(current_profit, (int, float)):
        current_margin = round(current_profit / current_revenue * 100.0, 1)

    g = await db.goals.find_one({"user_id": uid, "company_id": cid}) or {}

    # YTD manual: se o utilizador indicou o que já faturou este ANO EM VIGOR, anualizamos a partir daí.
    now = datetime.now(timezone.utc)
    ytd = float(g.get("ytd_revenue") or 0)
    ytd_info = None
    if ytd > 0:
        aod = _parse_date(g.get("ytd_as_of")) or now
        months_elapsed = 12 if aod.year < now.year else max(1, min(12, aod.month))
        annualized = round(ytd / months_elapsed * 12, 2)
        current_revenue = annualized
        if current_margin is not None:
            current_profit = round(annualized * current_margin / 100.0, 2)
        elif isinstance(current_profit, (int, float)) and current_profit and val.get("annual_revenue"):
            # deriva margem a partir do snapshot original, se existir
            m0 = current_profit / val["annual_revenue"] * 100.0
            current_margin = round(m0, 1)
            current_profit = round(annualized * m0 / 100.0, 2)
        # recalcula o valor atual de forma coerente com a faturação real deste ano
        gcv = compute_value_generic(net_worth, current_profit, current_revenue, cash)
        current_value = gcv["value"]
        ytd_info = {"ytd_revenue": round(ytd, 2), "months_elapsed": months_elapsed,
                    "annualized_revenue": annualized, "as_of": g.get("ytd_as_of")}

    # ---- Motor de avaliação híbrido: Automático | Múltiplo de Faturação | Múltiplo de EBITDA ----
    currency = "BRL" if "R$" in (sym or "") else "EUR"
    fin_off = await latest_official_financials(uid, cid) or {}
    ebitda = fin_off.get("ebitda")
    ebitda_source = None
    if isinstance(ebitda, (int, float)) and ebitda:
        ebitda_source = "documento oficial"
    elif isinstance(current_profit, (int, float)) and current_profit and current_profit > 0:
        ebitda = round(current_profit * 1.3, 2)
        ebitda_source = "estimado (a partir do lucro líquido)"
    else:
        ebitda = None
    suggestions = suggest_multiples(sector, currency)
    method = g.get("valuation_method") or "auto"
    custom_mult = g.get("value_multiple_custom")
    if method == "revenue":
        used_multiple = float(custom_mult) if custom_mult else suggestions["revenue"]["suggested"]
        if isinstance(current_revenue, (int, float)) and current_revenue:
            current_value = round(current_revenue * used_multiple, 2)
    elif method == "ebitda":
        used_multiple = float(custom_mult) if custom_mult else suggestions["ebitda"]["suggested"]
        if isinstance(ebitda, (int, float)) and ebitda:
            current_value = round(ebitda * used_multiple, 2)
    else:
        method = "auto"
        used_multiple = val.get("multiple")
    valuation_info = {
        "method": method, "used_multiple": used_multiple, "custom": custom_mult is not None,
        "ebitda": round(ebitda, 2) if isinstance(ebitda, (int, float)) else None,
        "ebitda_source": ebitda_source, "suggestions": suggestions,
    }

    # Dados em falta (avisamos, nunca inventamos)
    missing = []
    if not snap.get("has_balance") and not ytd:
        missing.append({"field": "perfil", "label": "Perfil financeiro / documentos",
                        "where": "Finanças → Perfil Financeiro (ou carrega a tua IES/Balancete)"})
    if not current_revenue:
        missing.append({"field": "faturacao", "label": "Faturação anual",
                        "where": "insere a faturação já feita este ano acima, ou preenche o Perfil Financeiro"})
    if current_margin is None:
        missing.append({"field": "margem", "label": "Margem líquida (lucro vs faturação)",
                        "where": "Finanças → Perfil Financeiro (custos fixos e variáveis)"})

    saved = {"target_value": g.get("target_value"), "deadline_type": g.get("deadline_type"),
             "deadline_years": g.get("deadline_years"), "deadline_date": g.get("deadline_date"),
             "ytd_revenue": g.get("ytd_revenue"), "ytd_as_of": g.get("ytd_as_of"),
             "valuation_method": method, "value_multiple_custom": custom_mult}

    base = {
        "currency_symbol": sym, "sector": sector,
        "current_value": round(current_value, 2), "net_worth": round(net_worth, 2),
        "cash": round(cash, 2), "total_liabilities": round(total_liab, 2),
        "current_revenue": round(current_revenue, 2) if isinstance(current_revenue, (int, float)) else None,
        "current_profit": round(current_profit, 2) if isinstance(current_profit, (int, float)) else None,
        "current_margin": current_margin,
        "financials_source": snap.get("financials_source"),
        "value_sources": snap.get("value_sources"),
        "multiple": val.get("multiple"),
        "valuation": valuation_info,
        "ytd": ytd_info,
        "goal": saved, "missing": missing,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }

    tv = float(g.get("target_value") or 0)
    if tv <= 0:
        return {**base, "configured": False}

    years_left = _years_left(g, now)

    # Projeção mantendo o ritmo atual: valor cresce pelo lucro retido/ano (honesto)
    pace_profit = current_profit if isinstance(current_profit, (int, float)) and current_profit > 0 else 0.0
    projected_pace = round(current_value + pace_profit * years_left, 2)
    difference = round(tv - projected_pace, 2)

    # Trajetórias ano-a-ano (para o gráfico da Fase 2 e para a tabela)
    n = max(1, math.ceil(years_left))
    trajectory = [{"label": "Atual", "year": now.year, "pace": round(current_value, 2), "goal": round(current_value, 2)}]
    for k in range(1, n + 1):
        frac = min(k, years_left)
        pace_v = round(current_value + pace_profit * frac, 2)
        goal_v = round(current_value + (tv - current_value) * (frac / years_left), 2)
        trajectory.append({"label": f"Ano {k}", "year": now.year + k, "pace": pace_v, "goal": goal_v})

    # Engenharia inversa — depende do método de avaliação escolhido
    if current_margin and current_margin > 0:
        assumed_margin = current_margin
        margin_assumed = False
    else:
        assumed_margin = 10.0
        margin_assumed = True

    if method == "revenue" and used_multiple:
        req_rev = tv / used_multiple
        req = {"reached": current_value >= tv, "multiple": used_multiple,
               "required_revenue": round(req_rev, 2),
               "required_monthly_revenue": round(req_rev / 12, 2),
               "required_profit": round(req_rev * assumed_margin / 100.0, 2)}
    elif method == "ebitda" and used_multiple:
        req_ebitda = tv / used_multiple
        if isinstance(ebitda, (int, float)) and ebitda > 0 and current_revenue and current_revenue > 0:
            ebitda_margin = ebitda / current_revenue * 100.0
        else:
            ebitda_margin = max(1.0, assumed_margin * 1.3)
        req_rev = req_ebitda / (ebitda_margin / 100.0)
        req = {"reached": current_value >= tv, "multiple": used_multiple,
               "required_ebitda": round(req_ebitda, 2), "ebitda_margin": round(ebitda_margin, 1),
               "required_revenue": round(req_rev, 2),
               "required_monthly_revenue": round(req_rev / 12, 2),
               "required_profit": round(req_rev * assumed_margin / 100.0, 2)}
    else:
        req = required_performance_for_value(tv, net_worth, assumed_margin, cash)

    req_growth_total = None
    req_growth_annual = None
    if req.get("required_revenue") and current_revenue and current_revenue > 0:
        req_growth_total = round((req["required_revenue"] / current_revenue - 1) * 100, 0)
        req_growth_annual = round(((req["required_revenue"] / current_revenue) ** (1 / years_left) - 1) * 100, 0)
    monthly_diff = None
    if req.get("required_monthly_revenue") is not None and current_revenue:
        monthly_diff = round(req["required_monthly_revenue"] - current_revenue / 12.0, 2)

    progress = round(min(100, current_value / tv * 100), 1) if tv else 0
    has_debt_pressure = total_liab > max(net_worth, 0) and total_liab > 0
    viability = _viability(req_growth_annual, current_margin, assumed_margin, has_debt_pressure)
    obstacle_key, obstacle_msg = _obstacle(current_margin, current_revenue, req.get("required_revenue"), has_debt_pressure)

    return {
        **base, "configured": True,
        "target_value": tv, "years_left": years_left,
        "projected_pace": projected_pace, "pace_growth_per_year": round(pace_profit, 2),
        "difference": difference, "progress": progress,
        "trajectory": trajectory,
        "required": {
            **req,
            "assumed_margin": round(assumed_margin, 1), "margin_assumed": margin_assumed,
            "required_growth_total": req_growth_total, "required_growth_annual": req_growth_annual,
            "monthly_diff": monthly_diff,
        },
        "viability": viability,
        "obstacle": {"key": obstacle_key, "message": obstacle_msg},
    }


@router.get("/goal")
async def get_goal(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    return await _compute_projection(uid, cid)


@router.post("/goal")
async def save_goal(inp: GoalInput, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    dump = inp.model_dump(exclude_unset=True)
    data = {k: v for k, v in dump.items() if v is not None}
    data.update({"user_id": uid, "company_id": cid, "updated_at": datetime.now(timezone.utc).isoformat()})
    unset = {"goal_near_emailed": "", "goal_reached_emailed": ""}
    # só limpa o override manual do múltiplo se o cliente o enviou explicitamente como null
    if "value_multiple_custom" in dump and dump["value_multiple_custom"] is None:
        unset["value_multiple_custom"] = ""
    await db.goals.update_one({"user_id": uid, "company_id": cid},
                              {"$set": data, "$unset": unset}, upsert=True)
    await db.ai_cache.delete_many({"user_id": uid, "kind": "goal_plan"})
    return {"ok": True}


@router.post("/goal/notify")
async def goal_notify(user: dict = Depends(premium_user)):
    """Envia (sob pedido) o estado atual da meta de valor para o email do utilizador."""
    uid = user["id"]; cid = await active_company_id(uid)
    prog = await compute_goal_progress(uid, cid)
    if not prog:
        return {"ok": False, "reason": "no_goal"}
    u = await db.users.find_one({"_id": ObjectId(uid)})
    if not u or not u.get("email"):
        return {"ok": False, "reason": "no_email"}
    html = build_goal_alert_html(u.get("name", ""), prog["currency_symbol"], prog["current"],
                                 prog["target"], prog["pct"], prog["reached"], os.environ.get("FRONTEND_URL", ""))
    subj = ("Atingiste a tua meta de valor — CEO AI 2.0" if prog["reached"]
            else f"Estás a {int(round(prog['pct']))}% da tua meta de valor — CEO AI 2.0")
    ok = await send_email_raw(u["email"], subj, html)
    return {"ok": bool(ok), "sent_to": u["email"], "pct": prog["pct"]}


@router.post("/goal/plan")
async def goal_plan(user: dict = Depends(premium_user)):
    """Perspetiva do CEO por IA — gerada só sob pedido (botão), com cache diário."""
    uid = user["id"]; cid = await active_company_id(uid)
    out = await _compute_projection(uid, cid)
    if not out.get("configured"):
        return {"configured": False}
    sym = out["currency_symbol"]
    req = out.get("required") or {}
    sysmsg = await build_system_prompt(uid, user.get("name", ""))
    prompt = (
        f"O empresário definiu uma META DE VALOR DA EMPRESA (não é meta de faturação). "
        f"Usa SÓ estes números REAIS (nunca inventes):\n"
        f"- Valor atual estimado da empresa: {sym}{round(out['current_value'])}\n"
        f"- Meta de valor: {sym}{round(out['target_value'])} · Prazo: {round(out['years_left'], 1)} anos\n"
        f"- Valor projetado mantendo o ritmo atual: {sym}{round(out['projected_pace'])}\n"
        f"- Diferença até à meta: {sym}{round(out['difference'])}\n"
        f"- Faturação anual atual: {sym}{round(out['current_revenue'] or 0)} · Margem atual: {out.get('current_margin')}%\n"
        f"- Para chegar à meta é preciso ~{sym}{round(req.get('required_profit') or 0)} de lucro/ano, "
        f"~{sym}{round(req.get('required_revenue') or 0)} de faturação/ano "
        f"(~{sym}{round(req.get('required_monthly_revenue') or 0)}/mês) e margem ~{req.get('assumed_margin')}%.\n"
        f"- Principal obstáculo identificado: {out['obstacle']['message']}\n"
        f"- Viabilidade: {out['viability']['label']}.\n"
        "Devolve APENAS JSON: {\"diagnostico\":str,\"veredicto\":str,\"acoes\":[{\"acao\":str,\"impacto\":str}],\"frase\":str}. "
        "'diagnostico': 2-3 frases sobre se vai chegar à meta no prazo e porquê, com os números e específico ao SETOR. "
        "'veredicto': 1 frase directa. "
        "'acoes': 3 a 4 ações concretas e priorizadas para fechar a diferença, cada uma com 'impacto' em " + sym + " ou %. "
        "'frase': 1 frase motivadora e realista. Português europeu. Sem texto fora do JSON."
    )
    plan = await cached_ai("goal_plan", uid, cid, sysmsg, prompt) or {}
    return {"configured": True, "ceo_plan": plan}



@router.post("/goal/share")
async def goal_share(user: dict = Depends(premium_user)):
    """Cria/atualiza um link público (só de leitura) com o resumo da meta e progresso."""
    uid = user["id"]; cid = await active_company_id(uid)
    out = await _compute_projection(uid, cid)
    if not out.get("configured"):
        return {"ok": False, "reason": "no_goal"}
    company = await resolve_company(uid) or {}
    existing = await db.goal_shares.find_one({"user_id": uid, "company_id": cid})
    token = existing["token"] if existing else uuid.uuid4().hex[:16]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.goal_shares.update_one(
        {"token": token},
        {"$set": {"token": token, "user_id": uid, "company_id": cid,
                  "company_name": company.get("name", "A minha empresa"),
                  "owner_name": user.get("name", ""),
                  "data": out, "updated_at": now_iso},
         "$setOnInsert": {"created_at": now_iso}},
        upsert=True)
    return {"ok": True, "token": token}


@router.get("/goal/share/{token}")
async def goal_share_get(token: str):
    """Público (sem autenticação) — resumo só de leitura para partilhar com sócios/contabilista."""
    doc = await db.goal_shares.find_one({"token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Link não encontrado")
    return {"company_name": doc.get("company_name"), "owner_name": doc.get("owner_name"),
            "updated_at": doc.get("updated_at"), "data": doc.get("data")}
