"""Diretor de Marketing — planeamento contextual, workflow editorial e calendário operacional."""
import base64
import hashlib
import os
import uuid
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core import (
    active_company_id,
    ai_json,
    build_snapshot,
    composite_logo,
    db,
    generate_marketing_image,
    generate_marketing_images,
    generate_post_visual_scenes,
    gerar_prompt_imagem_do_post,
    gerarPromptImagemDoPost,
    get_erp_financial_context,
    logger,
    premium_user,
    resolve_company,
    send_email_raw,
    store_public_media,
)

router = APIRouter()

WORKFLOW_STATUSES = {"draft", "approved", "scheduled"}
POST_FORMATS = ["Post", "Story", "Reel"]
WEEKDAYS_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
CAMPAIGN_OBJECTIVES = {
    "awareness": {
        "label": "Awareness",
        "headline": "Ganhar alcance qualificado e reconhecimento de marca",
        "audience": "novos decisores e mercado frio",
        "cta": "seguir, guardar e pedir mais informação",
    },
    "leads": {
        "label": "Leads",
        "headline": "Converter atenção em pedidos de contacto e reuniões",
        "audience": "leads mornos e decisores com intenção",
        "cta": "pedir diagnóstico, proposta ou reunião",
    },
    "reativacao": {
        "label": "Reativação",
        "headline": "Reaquecer oportunidades paradas e clientes adormecidos",
        "audience": "leads parados e clientes sem contacto recente",
        "cta": "responder, voltar à conversa ou reabrir oportunidade",
    },
}


def _serialize(doc):
    if not doc:
        return None
    doc = dict(doc)
    if doc.get("_id") is not None:
        doc["id"] = str(doc.get("_id"))
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.pop("company_id", None)
    return doc


def _str_list(value, limit=8):
    if isinstance(value, list):
        out = []
        for item in value:
            text = str(item or "").strip()
            if text:
                out.append(text)
            if len(out) >= limit:
                break
        return out
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _short(value, fallback="n/d"):
    text = str(value or "").strip()
    return text or fallback


def _money(value, sym="€"):
    if not isinstance(value, (int, float)):
        return "n/d"
    return f"{sym}{int(round(value)):,}".replace(",", " ")


def _workflow_summary(posts):
    counts = {k: 0 for k in WORKFLOW_STATUSES}
    for post in posts or []:
        status = post.get("status") if isinstance(post, dict) else None
        if status not in counts:
            status = "draft"
        counts[status] += 1
    counts["total"] = len(posts or [])
    return counts


def _clean_image_variants(value) -> list[str]:
    variants = []
    items = value if isinstance(value, list) else []
    for item in items[:3]:
        if isinstance(item, dict):
            url = str(item.get("url") or "").strip()
        else:
            url = str(item or "").strip()
        if url:
            variants.append(url)
    return variants


def _apply_post_media_defaults(post: dict) -> bool:
    changed = False
    variants = _clean_image_variants(post.get("image_variants"))
    image_url = str(post.get("image_url") or "").strip()
    if not variants and image_url:
        variants = [image_url]
        changed = True
    if variants and image_url and image_url not in variants:
        variants = [image_url, *[item for item in variants if item != image_url]][:3]
        changed = True
    selected_index = post.get("selected_image_index")
    if variants:
        if not isinstance(selected_index, int) or selected_index < 0 or selected_index >= len(variants):
            selected_index = variants.index(image_url) if image_url in variants else 0
            changed = True
        selected_url = variants[selected_index]
        if post.get("image_url") != selected_url:
            post["image_url"] = selected_url
            changed = True
    else:
        if post.get("image_url") is not None:
            post["image_url"] = None
            changed = True
        if selected_index is not None:
            selected_index = None
            changed = True
    if post.get("image_variants") != variants:
        post["image_variants"] = variants
        changed = True
    if post.get("selected_image_index") != selected_index:
        post["selected_image_index"] = selected_index
        changed = True
    return changed


def _ensure_marketing_post_media(content: dict) -> bool:
    changed = False
    for post in (content.get("posts") or []):
        changed = _apply_post_media_defaults(post) or changed
    return changed


def _find_post_by_id(content: dict, post_id: str) -> Optional[dict]:
    return next((post for post in (content.get("posts") or []) if post.get("id") == post_id), None)


def apply_post_status(content: dict, post_id: str, status: str, scheduled_at: Optional[str] = None,
                      published_at: Optional[str] = None) -> bool:
    status = status if status in WORKFLOW_STATUSES else "draft"
    posts = content.get("posts") or []
    changed = False
    for post in posts:
        if post.get("id") != post_id:
            continue
        changed = True
        post["status"] = status
        if status == "draft":
            post["approved_at"] = None
            post["scheduled_at"] = None
            post["published_at"] = None
        elif status == "approved":
            post["approved_at"] = post.get("approved_at") or datetime.now(timezone.utc).isoformat()
            post["scheduled_at"] = None
            if published_at:
                post["published_at"] = published_at
        elif status == "scheduled":
            post["approved_at"] = post.get("approved_at") or datetime.now(timezone.utc).isoformat()
            post["scheduled_at"] = scheduled_at or post.get("scheduled_at")
            if published_at:
                post["published_at"] = published_at
        break
    if not changed:
        return False
    for item in (content.get("calendario") or []):
        if item.get("post_id") == post_id:
            item["status"] = status
            item["scheduled_at"] = scheduled_at if status == "scheduled" else None
    content["workflow_summary"] = _workflow_summary(posts)
    return True


def _fallback_brand(ctx: dict):
    sector = ctx.get("sector") or "Geral"
    return {
        "tom": f"Claro, confiante e útil para decisores no setor {sector.lower()}.",
        "pilares": [sector, "prova social", "educação", "bastidores"],
        "proposta_valor": f"Transformar a experiência de {sector.lower()} em confiança e oportunidade comercial.",
        "provas": ["Experiência prática", "Resultados concretos", "Linguagem simples"],
        "audiencias": [ctx.get("icp", {}).get("sector") or sector, "clientes atuais", "leads mornos"],
        "do_say": ["Mostrar processo", "Usar casos reais", "Fechar com CTA direto"],
        "avoid": ["Promessas vagas", "Jargão técnico em excesso", "Conteúdo genérico"],
    }


def _fallback_posts(ctx: dict, brand: dict):
    sector = ctx.get("sector") or "negócio"
    company = ctx.get("name") or "A empresa"
    pillars = _str_list(brand.get("pilares"), 4) or [sector, "prova social", "bastidores", "educação"]
    objectives = [
        "atrair novos leads",
        "gerar confiança",
        "educar o mercado",
        "reativar oportunidades paradas",
    ]
    posts = []
    for i in range(10):
        pillar = pillars[i % len(pillars)]
        objective = objectives[i % len(objectives)]
        fmt = POST_FORMATS[i % len(POST_FORMATS)]
        weekday = WEEKDAYS_PT[i % len(WEEKDAYS_PT)]
        title = f"{company}: {pillar.capitalize()} com foco em {objective}"
        legend = (
            f"Em {sector.lower()}, confiança gera negócio. Hoje mostramos como {company} trabalha {pillar} "
            f"para {objective}."
        )
        posts.append({
            "id": f"post-{i + 1}",
            "formato": fmt,
            "titulo": title,
            "legenda": legend,
            "hashtags": [f"#{sector.lower().replace(' ', '')}", "#ceoai", "#marketing", "#pme"],
            "cta": "Quer que adaptemos isto ao teu caso? Fala connosco.",
            "dia": weekday,
            "tema": pillar.capitalize(),
            "objetivo": objective,
            "pilar": pillar,
            "status": "draft",
            "approved_at": None,
            "scheduled_at": None,
            "published_at": None,
            "image_url": None,
            "image_variants": [],
            "selected_image_index": None,
        })
    return posts


def _normalize_brand(raw: dict, ctx: dict):
    base = _fallback_brand(ctx)
    raw = raw if isinstance(raw, dict) else {}
    brand = {
        "tom": _short(raw.get("tom"), base["tom"]),
        "pilares": _str_list(raw.get("pilares"), 6) or base["pilares"],
        "proposta_valor": _short(raw.get("proposta_valor"), base["proposta_valor"]),
        "provas": _str_list(raw.get("provas"), 6) or base["provas"],
        "audiencias": _str_list(raw.get("audiencias"), 6) or base["audiencias"],
        "do_say": _str_list(raw.get("do_say"), 6) or base["do_say"],
        "avoid": _str_list(raw.get("avoid"), 6) or base["avoid"],
    }
    return brand


def _normalize_posts(raw_posts, brand: dict, ctx: dict):
    items = raw_posts if isinstance(raw_posts, list) else []
    out = []
    for idx, item in enumerate(items[:12]):
        item = item if isinstance(item, dict) else {}
        fmt = _short(item.get("formato"), POST_FORMATS[idx % len(POST_FORMATS)]).title()
        if fmt not in POST_FORMATS:
            fmt = POST_FORMATS[idx % len(POST_FORMATS)]
        title = _short(item.get("titulo"), f"Conteúdo {idx + 1}")
        pillar = _short(item.get("pilar"), (brand.get("pilares") or [ctx.get("sector") or "marca"])[idx % max(1, len(brand.get("pilares") or [1]))])
        objective = _short(item.get("objetivo"), "gerar confiança")
        out.append({
            "id": _short(item.get("id"), f"post-{idx + 1}"),
            "formato": fmt,
            "titulo": title,
            "legenda": _short(item.get("legenda"), f"{title} — conteúdo preparado pelo Diretor de Marketing."),
            "hashtags": _str_list(item.get("hashtags"), 6) or ["#ceoai", "#marketing", "#pme"],
            "cta": _short(item.get("cta"), "Fale connosco para dar o próximo passo."),
            "dia": _short(item.get("dia"), WEEKDAYS_PT[idx % len(WEEKDAYS_PT)]),
            "tema": _short(item.get("tema"), title),
            "objetivo": objective,
            "pilar": pillar,
            "status": "draft",
            "approved_at": None,
            "scheduled_at": None,
            "published_at": None,
            "image_url": str(item.get("image_url") or "").strip() or None,
            "image_variants": _clean_image_variants(item.get("image_variants")),
            "selected_image_index": item.get("selected_image_index") if isinstance(item.get("selected_image_index"), int) else None,
        })
    normalized = out or _fallback_posts(ctx, brand)
    _ensure_marketing_post_media({"posts": normalized})
    return normalized


def _normalize_library(raw_library, posts, brand):
    lib = raw_library if isinstance(raw_library, list) else []
    out = []
    for idx, item in enumerate(lib[:8]):
        item = item if isinstance(item, dict) else {}
        formats = [fmt for fmt in _str_list(item.get("formatos"), 3) if fmt.title() in POST_FORMATS]
        out.append({
            "id": _short(item.get("id"), f"lib-{idx + 1}"),
            "titulo": _short(item.get("titulo"), f"Ângulo editorial {idx + 1}"),
            "angulo": _short(item.get("angulo"), item.get("titulo") or "Ideia de conteúdo"),
            "objetivo": _short(item.get("objetivo"), "gerar tração comercial"),
            "pilar": _short(item.get("pilar"), (brand.get("pilares") or ["marca"])[idx % max(1, len(brand.get("pilares") or [1]))]),
            "formatos": formats or [POST_FORMATS[idx % len(POST_FORMATS)]],
            "cta": _short(item.get("cta"), "Responder, pedir orçamento ou marcar reunião."),
        })
    if out:
        return out
    seen = set()
    derived = []
    for idx, post in enumerate(posts[:6]):
        key = (post.get("tema") or post.get("titulo") or f"tema-{idx}").lower()
        if key in seen:
            continue
        seen.add(key)
        derived.append({
            "id": f"lib-{len(derived) + 1}",
            "titulo": post.get("tema") or post.get("titulo"),
            "angulo": post.get("titulo") or post.get("tema"),
            "objetivo": post.get("objetivo") or "gerar confiança",
            "pilar": post.get("pilar") or "marca",
            "formatos": [post.get("formato") or "Post"],
            "cta": post.get("cta") or "Pedir orçamento ou responder à publicação.",
        })
    return derived


def _normalize_calendar(raw_calendar, posts):
    today = datetime.now(timezone.utc).date()
    raw_calendar = raw_calendar if isinstance(raw_calendar, list) else []
    out = []
    for idx in range(30):
        source = raw_calendar[idx] if idx < len(raw_calendar) and isinstance(raw_calendar[idx], dict) else {}
        post = posts[idx % len(posts)] if posts else {}
        day = today + timedelta(days=idx)
        fmt = _short(source.get("formato"), post.get("formato") or POST_FORMATS[idx % len(POST_FORMATS)]).title()
        if fmt not in POST_FORMATS:
            fmt = post.get("formato") or POST_FORMATS[idx % len(POST_FORMATS)]
        out.append({
            "dia": _short(source.get("dia"), WEEKDAYS_PT[day.weekday()]),
            "data": day.isoformat(),
            "formato": fmt,
            "tema": _short(source.get("tema"), post.get("tema") or post.get("titulo") or f"Tema {idx + 1}"),
            "objetivo": _short(source.get("objetivo"), post.get("objetivo") or "gerar consistência"),
            "pilar": _short(source.get("pilar"), post.get("pilar") or "marca"),
            "post_id": _short(source.get("post_id"), post.get("id") or None),
            "status": post.get("status") if post.get("id") == source.get("post_id") else "draft",
            "scheduled_at": None,
        })
    return out


async def _ctx(uid: str, cid: str):
    company = await resolve_company(uid, cid) or {}
    prof = company.get("profile", {}) or {}
    snap = await build_snapshot(uid)
    icp = await db.crm_icp.find_one({"user_id": uid, "company_id": cid}, {"_id": 0}) or {}
    leads = await db.crm_leads.find(
        {"user_id": uid, "company_id": cid},
        {"_id": 0, "name": 1, "stage": 1, "value": 1, "sector": 1, "urgency": 1, "source": 1, "score": 1},
    ).sort("score", -1).to_list(8)
    lead_counts = {}
    for lead in leads:
        stage = lead.get("stage") or "novo"
        lead_counts[stage] = lead_counts.get(stage, 0) + 1
    memories = await db.memories.find({"user_id": uid}, {"_id": 0, "content": 1, "category": 1}).sort("created_at", -1).to_list(8)
    erp = await get_erp_financial_context(uid, cid) or {}
    return {
        "name": company.get("name") or snap.get("company_name") or "A empresa",
        "sector": company.get("sector") or prof.get("sector") or prof.get("activity") or "Geral",
        "region": company.get("region", "PT"),
        "business_model": prof.get("business_model", ""),
        "main_goal": prof.get("main_goal", ""),
        "advantage": prof.get("advantage", ""),
        "main_worry": prof.get("main_worry", ""),
        "biggest_client_pct": prof.get("biggest_client_pct"),
        "client_recurrence": prof.get("client_recurrence", ""),
        "memories": memories,
        "icp": icp,
        "leads": leads,
        "lead_counts": lead_counts,
        "erp": erp,
        "snapshot": snap,
    }


def _prompt_context(ctx: dict):
    snap = ctx.get("snapshot") or {}
    val = snap.get("valuation") or {}
    sym = snap.get("currency_symbol", "€")
    mem_lines = "\n".join(f"- [{m.get('category', 'geral')}] {m.get('content', '')}" for m in (ctx.get("memories") or [])[:6]) or "- sem memórias registadas"
    icp = ctx.get("icp") or {}
    icp_line = (
        f"ICP: setor {icp.get('sector') or 'n/d'} · dimensão {icp.get('size') or 'n/d'} · região {icp.get('region') or 'n/d'} · "
        f"decisor {icp.get('decisor') or 'n/d'} · dor {icp.get('dor') or 'n/d'} · ticket ideal {_money(icp.get('ticket_ideal'), sym)}"
    )
    leads_line = "\n".join(
        f"- {l.get('name')} | fase {l.get('stage')} | score {l.get('score')} | valor {_money(l.get('value'), sym)} | urgência {l.get('urgency') or 'n/d'}"
        for l in (ctx.get("leads") or [])[:5]
    ) or "- sem leads no CRM"
    erp = ctx.get("erp") or {}
    erp_fixed = ", ".join(f"{c.get('name')}: {_money(c.get('amount'), sym)}" for c in (erp.get("fixed_costs") or [])[:5]) or "n/d"
    erp_line = (
        f"Fonte financeira ativa: {erp.get('source_label') or snap.get('financial_context_source') or 'sem ERP ativo'}\n"
        f"Caixa: {_money(erp.get('cash_balance', snap.get('cash_available')), sym)} · Dívida: {_money(erp.get('total_debt', snap.get('total_liabilities')), sym)} · "
        f"Faturação mensal: {_money(erp.get('monthly_revenue'), sym)} · Custos fixos: {erp_fixed}"
    )
    return (
        f"Empresa: {ctx['name']}\n"
        f"Setor: {ctx['sector']} · Região: {ctx['region']} · Modelo de negócio: {ctx.get('business_model') or 'n/d'}\n"
        f"Objetivo principal: {ctx.get('main_goal') or 'n/d'}\n"
        f"Vantagem competitiva: {ctx.get('advantage') or 'n/d'}\n"
        f"Maior preocupação: {ctx.get('main_worry') or 'n/d'}\n"
        f"Maior cliente: {ctx.get('biggest_client_pct') or 'n/d'}% · Recorrência: {ctx.get('client_recurrence') or 'n/d'}\n"
        f"Saúde: {snap.get('health', 'n/d')}/100 · Valor da empresa: {_money(snap.get('company_value'), sym)} · "
        f"Lucro anual estimado: {_money(val.get('annual_profit'), sym)}\n\n"
        f"MEMÓRIAS ÚTEIS:\n{mem_lines}\n\n"
        f"CRM E CLIENTE IDEAL:\n{icp_line}\n"
        f"Leads prioritários:\n{leads_line}\n\n"
        f"CONTEXTO FINANCEIRO/ERP:\n{erp_line}"
    )


def _brand_brain(ctx: dict, brand: dict, library: list, posts: list):
    snap = ctx.get("snapshot") or {}
    lead_counts = ctx.get("lead_counts") or {}
    priorities = []
    if (ctx.get("icp") or {}).get("dor"):
        priorities.append(f"Responder à dor central do ICP: {ctx['icp']['dor']}")
    if ctx.get("biggest_client_pct") and float(ctx.get("biggest_client_pct") or 0) >= 30:
        priorities.append("Reduzir dependência do maior cliente com prova social e novos segmentos")
    if snap.get("health") is not None and snap.get("health") < 60:
        priorities.append("Privilegiar conteúdo de conversão e caixa de curto prazo")
    if lead_counts.get("proposta") or lead_counts.get("negociacao"):
        priorities.append("Criar peças para desbloquear leads já em proposta/negociação")
    if not priorities:
        priorities.append("Manter consistência editorial e reforçar posicionamento")
    return {
        "context_sources": {
            "memories": len(ctx.get("memories") or []),
            "crm_leads": len(ctx.get("leads") or []),
            "icp_defined": bool(ctx.get("icp")),
            "erp_active": bool(ctx.get("erp")),
        },
        "prioridades": priorities,
        "angles": [item.get("angulo") for item in library[:4] if item.get("angulo")],
        "headline_focus": posts[0].get("titulo") if posts else "",
        "positioning": brand.get("proposta_valor"),
        "financial_guardrail": snap.get("financial_context_source") or "os teus dados",
    }


def _normalize_content(raw: dict, ctx: dict):
    raw = raw if isinstance(raw, dict) else {}
    brand = _normalize_brand(raw.get("brand"), ctx)
    posts = _normalize_posts(raw.get("posts"), brand, ctx)
    library = _normalize_library(raw.get("biblioteca") or raw.get("library"), posts, brand)
    calendar = _normalize_calendar(raw.get("calendario"), posts)
    content = {
        "brand": brand,
        "biblioteca": library,
        "posts": posts,
        "calendario": calendar,
    }
    content["brand_brain"] = _brand_brain(ctx, brand, library, posts)
    content["workflow_summary"] = _workflow_summary(posts)
    return content


def _normalize_objective(value: Optional[str]) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "awareness": "awareness",
        "alcance": "awareness",
        "reconhecimento": "awareness",
        "leads": "leads",
        "lead": "leads",
        "reativacao": "reativacao",
        "reativação": "reativacao",
        "reactivation": "reativacao",
    }
    return mapping.get(raw, "awareness")


def _campaign_defaults(ctx: dict, payload: dict):
    objective = _normalize_objective(payload.get("objective"))
    meta = CAMPAIGN_OBJECTIVES[objective]
    company = ctx.get("name") or "Empresa"
    sector = (ctx.get("sector") or "mercado").lower()
    icp = ctx.get("icp") or {}
    audience = payload.get("audience") or icp.get("sector") or meta["audience"]
    offer = payload.get("offer") or ("diagnóstico rápido" if objective == "leads" else "proposta de valor clara")
    objective_text = {
        "awareness": "fazer a marca aparecer mais vezes perante o ICP certo",
        "leads": "gerar respostas concretas e pedidos de contacto",
        "reativacao": "dar uma razão forte para responder agora",
    }[objective]
    channels = {
        "awareness": [
            {"channel": "Instagram", "format": "Reel", "hook": f"Mostrar {company} em ação no setor {sector}", "cta": "Guardar e seguir para ver mais bastidores.", "distribution": "Feed + Reels", "purpose": "Alcance frio"},
            {"channel": "Instagram Stories", "format": "Story", "hook": "3 provas rápidas com bastidores e prova social", "cta": "Responder à story para saber mais.", "distribution": "Stories em série", "purpose": "Memorização"},
            {"channel": "Facebook", "format": "Post", "hook": "Caso real com resultado tangível", "cta": "Comentar ou enviar mensagem.", "distribution": "Página + grupos parceiros", "purpose": "Confiança local"},
            {"channel": "CRM / Email", "format": "Email curto", "hook": "Resumo do melhor conteúdo da semana", "cta": "Pedir exemplo ou demonstração.", "distribution": "Base própria", "purpose": "Reciclar alcance para owned media"},
        ],
        "leads": [
            {"channel": "Instagram", "format": "Carousel", "hook": f"Checklist prática para decisores em {sector}", "cta": "Enviar mensagem para receber o diagnóstico.", "distribution": "Feed", "purpose": "Captação"},
            {"channel": "Instagram Stories", "format": "Story", "hook": "Pergunta + prova + CTA direto", "cta": "Responder com 'quero' para abrir conversa.", "distribution": "Stories com sticker", "purpose": "Resposta imediata"},
            {"channel": "Facebook", "format": "Post", "hook": "Oferta clara com prova social", "cta": f"Pedir {offer}.", "distribution": "Página + retargeting manual", "purpose": "Conversão"},
            {"channel": "CRM / WhatsApp", "format": "Follow-up", "hook": "Mensagem curta a leads mornos com ângulo do conteúdo", "cta": "Agendar chamada de 15 minutos.", "distribution": "Leads do CRM", "purpose": "Fecho comercial"},
        ],
        "reativacao": [
            {"channel": "Instagram", "format": "Reel", "hook": "Antes/depois ou erro comum que faz perder dinheiro", "cta": "Voltar a falar connosco hoje.", "distribution": "Feed + Reels", "purpose": "Reabrir atenção"},
            {"channel": "Instagram Stories", "format": "Story", "hook": "Sondagem para retomar interesse", "cta": "Responder à story com a prioridade atual.", "distribution": "Stories", "purpose": "Resposta leve"},
            {"channel": "Facebook", "format": "Post", "hook": "Lembrete com prova recente e urgência saudável", "cta": "Enviar mensagem para atualizar o caso.", "distribution": "Página", "purpose": "Reengagement"},
            {"channel": "CRM / Email", "format": "Email de reativação", "hook": "'Vale a pena retomarmos este tema?'", "cta": "Responder com interesse ou objeção principal.", "distribution": "Base de leads parados", "purpose": "Desbloqueio"},
        ],
    }[objective]
    kpis = {
        "awareness": ["reach qualificado", "guardados/partilhas", "visitas ao perfil", "novos seguidores com fit"],
        "leads": ["DMs iniciadas", "cliques para contacto", "pedidos de diagnóstico", "reuniões marcadas"],
        "reativacao": ["respostas reabertas", "reativação de oportunidades", "taxa de reply", "reuniões recuperadas"],
    }[objective]
    experiments = {
        "awareness": ["Trocar prova social por bastidores no gancho principal", "Testar Reel curto vs carrossel educativo"],
        "leads": ["CTA com oferta vs CTA com diagnóstico", "Prova numérica vs dor do ICP no primeiro slide"],
        "reativacao": ["Urgência leve vs curiosidade no assunto", "Caso real recente vs pergunta direta ao lead"],
    }[objective]
    plan = [
        {"day": "Dia 1", "channel": channels[0]["channel"], "action": f"Lançar peça hero com foco em {objective_text}."},
        {"day": "Dia 3", "channel": channels[1]["channel"], "action": "Reforçar a mensagem com prova curta e CTA nativo."},
        {"day": "Dia 5", "channel": channels[2]["channel"], "action": "Publicar a versão mais explicativa com prova social."},
        {"day": "Dia 7", "channel": channels[3]["channel"], "action": "Ativar a base própria para puxar resposta direta."},
    ]
    return {
        "objective": objective,
        "objective_label": meta["label"],
        "name": payload.get("name") or f"{meta['label']} · {company}",
        "audience": audience,
        "offer": offer,
        "summary": f"Campanha multicanal para {objective_text}, alinhada com o contexto comercial e financeiro atual de {company}.",
        "core_message": f"{company} deve comunicar valor concreto para {audience} e fechar sempre com CTA para {meta['cta']}.",
        "channels": channels,
        "kpis": kpis,
        "experiments": experiments,
        "launch_plan": plan,
        "next_actions": [
            "Escolher um post hero e adaptá-lo aos 2 canais principais.",
            "Definir um CTA único para esta campanha durante 7-14 dias.",
            "Rever respostas/comentários e ajustar o 2.º toque com base nisso.",
        ],
    }


def _normalize_campaign(raw: dict, ctx: dict, payload: dict):
    base = _campaign_defaults(ctx, payload)
    raw = raw if isinstance(raw, dict) else {}
    channels_raw = raw.get("channels") if isinstance(raw.get("channels"), list) else []
    plan_raw = raw.get("launch_plan") if isinstance(raw.get("launch_plan"), list) else []
    channels = []
    for idx, default in enumerate(base["channels"]):
        item = channels_raw[idx] if idx < len(channels_raw) and isinstance(channels_raw[idx], dict) else {}
        channels.append({
            "channel": _short(item.get("channel"), default["channel"]),
            "format": _short(item.get("format"), default["format"]),
            "purpose": _short(item.get("purpose"), default["purpose"]),
            "hook": _short(item.get("hook"), default["hook"]),
            "cta": _short(item.get("cta"), default["cta"]),
            "distribution": _short(item.get("distribution"), default["distribution"]),
        })
    launch_plan = []
    for idx, default in enumerate(base["launch_plan"]):
        item = plan_raw[idx] if idx < len(plan_raw) and isinstance(plan_raw[idx], dict) else {}
        launch_plan.append({
            "day": _short(item.get("day"), default["day"]),
            "channel": _short(item.get("channel"), default["channel"]),
            "action": _short(item.get("action"), default["action"]),
        })
    return {
        **base,
        "summary": _short(raw.get("summary"), base["summary"]),
        "core_message": _short(raw.get("core_message"), base["core_message"]),
        "audience": _short(raw.get("audience"), base["audience"]),
        "offer": _short(raw.get("offer"), base["offer"]),
        "channels": channels,
        "kpis": _str_list(raw.get("kpis"), 6) or base["kpis"],
        "experiments": _str_list(raw.get("experiments"), 4) or base["experiments"],
        "launch_plan": launch_plan,
        "next_actions": _str_list(raw.get("next_actions"), 4) or base["next_actions"],
    }


def _stable_seed(*parts):
    joined = "|".join(str(p or "") for p in parts)
    return int(hashlib.sha256(joined.encode("utf-8")).hexdigest()[:8], 16)


def _top_signal(metrics: dict):
    mapping = {
        "likes": "atraiu reacção rápida",
        "comments": "gerou conversa",
        "shares": "foi suficientemente útil para partilha",
        "saves": "tem valor de referência",
        "clicks": "levou tráfego para a próxima ação",
        "profile_visits": "despertou curiosidade pela marca",
    }
    key = max(mapping.keys(), key=lambda item: metrics.get(item, 0))
    return mapping[key]


def build_mock_metrics(post: dict, published_at: str, channels: list[str]):
    fmt = post.get("formato") or "Post"
    title = post.get("titulo") or post.get("tema") or "Conteúdo"
    seed = _stable_seed(post.get("id"), title, published_at, ",".join(channels))
    base = {"Reel": 2400, "Post": 1600, "Story": 900}.get(fmt, 1400)
    impressions = base + (seed % 1800) + (max(len(channels), 1) - 1) * 380
    reach = int(impressions * 0.72)
    likes = max(18, int(reach * {"Reel": 0.052, "Post": 0.036, "Story": 0.028}.get(fmt, 0.03)) + (seed % 37))
    comments = max(3, int(likes * 0.16) + (seed % 9))
    shares = max(2, int(likes * 0.19) + ((seed // 5) % 8))
    saves = max(4, int(likes * 0.24) + ((seed // 7) % 11))
    clicks = max(5, int(reach * 0.018) + ((seed // 9) % 13))
    profile_visits = max(7, int(reach * 0.025) + ((seed // 11) % 17))
    engagement = likes + comments + shares + saves
    metrics = {
        "impressions": impressions,
        "reach": reach,
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "saves": saves,
        "clicks": clicks,
        "profile_visits": profile_visits,
        "engagement_rate": round((engagement / max(reach, 1)) * 100, 2),
    }
    metrics["top_signal"] = _top_signal(metrics)
    return metrics


async def record_marketing_metrics(uid: str, cid: str, social_post_doc: dict, post: Optional[dict] = None, live_metrics: Optional[dict] = None):
    if not (uid and cid and social_post_doc):
        return None
    post = post or {}
    channels = [channel for channel, result in (social_post_doc.get("results") or {}).items() if isinstance(result, dict) and result.get("ok")]
    published_at = social_post_doc.get("created_at") or datetime.now(timezone.utc).isoformat()
    metrics = ((live_metrics or {}).get("metrics") or build_mock_metrics(post, published_at, channels))
    mocked = not bool(live_metrics and (live_metrics.get("metrics") or {}))
    doc = {
        "user_id": uid,
        "company_id": cid,
        "social_post_id": social_post_doc.get("_id"),
        "post_id": social_post_doc.get("post_id"),
        "post_title": social_post_doc.get("post_title") or post.get("titulo") or post.get("tema") or "Conteúdo",
        "format": social_post_doc.get("format") or post.get("formato") or "Post",
        "theme": social_post_doc.get("theme") or post.get("tema") or "Marca",
        "channels": channels,
        "metrics": metrics,
        "mocked": mocked,
        "metrics_source": (live_metrics or {}).get("source") if not mocked else "mocked_generator",
        "captured_at": (live_metrics or {}).get("captured_at") or datetime.now(timezone.utc).isoformat(),
        "published_at": published_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.marketing_post_metrics.update_one(
        {"user_id": uid, "company_id": cid, "social_post_id": social_post_doc.get("_id")},
        {"$set": doc},
        upsert=True,
    )
    return doc


def _analytics_breakdown(rows: list[dict], key: str):
    buckets = {}
    for row in rows:
        bucket = row.get(key) or "n/d"
        current = buckets.setdefault(bucket, {"count": 0, "reach": 0, "clicks": 0, "engagement_rate_sum": 0.0})
        current["count"] += 1
        current["reach"] += row.get("metrics", {}).get("reach", 0)
        current["clicks"] += row.get("metrics", {}).get("clicks", 0)
        current["engagement_rate_sum"] += row.get("metrics", {}).get("engagement_rate", 0)
    out = []
    for bucket, data in buckets.items():
        out.append({
            "label": bucket,
            "count": data["count"],
            "reach": data["reach"],
            "clicks": data["clicks"],
            "avg_engagement_rate": round(data["engagement_rate_sum"] / max(data["count"], 1), 2),
        })
    return sorted(out, key=lambda item: (item["avg_engagement_rate"], item["reach"]), reverse=True)


async def summarize_marketing_analytics(uid: str, cid: str):
    rows = await db.marketing_post_metrics.find({"user_id": uid, "company_id": cid}).sort("published_at", -1).to_list(100)
    if not rows:
        return {
            "mocked": True,
            "summary": {"published_posts": 0, "reach": 0, "impressions": 0, "clicks": 0, "avg_engagement_rate": 0},
            "top_posts": [],
            "best_formats": [],
            "best_weekdays": [],
            "insights": ["Ainda não há publicações suficientes para aprender com dados reais ou simulados."],
            "recommended_actions": ["Publique 3 a 5 conteúdos e volte aqui para ativar o loop de aprendizagem."],
        }

    totals = {"published_posts": len(rows), "reach": 0, "impressions": 0, "clicks": 0, "engagement_rate_sum": 0.0}
    mocked = all(row.get("mocked", True) for row in rows)
    top_posts = []
    weekday_rows = []
    for row in rows:
        metrics = row.get("metrics") or {}
        totals["reach"] += metrics.get("reach", 0)
        totals["impressions"] += metrics.get("impressions", 0)
        totals["clicks"] += metrics.get("clicks", 0)
        totals["engagement_rate_sum"] += metrics.get("engagement_rate", 0)
        try:
            weekday = WEEKDAYS_PT[datetime.fromisoformat((row.get("published_at") or "").replace("Z", "+00:00")).weekday()]
        except Exception:
            weekday = "n/d"
        weekday_rows.append({**row, "weekday": weekday})
        top_posts.append({
            "post_id": row.get("post_id"),
            "title": row.get("post_title"),
            "format": row.get("format"),
            "theme": row.get("theme"),
            "channels": row.get("channels") or [],
            "published_at": row.get("published_at"),
            "mocked": row.get("mocked", True),
            **metrics,
        })

    avg_engagement = round(totals["engagement_rate_sum"] / max(totals["published_posts"], 1), 2)
    best_formats = _analytics_breakdown(rows, "format")
    best_weekdays = _analytics_breakdown(weekday_rows, "weekday")
    top_posts = sorted(top_posts, key=lambda item: (item.get("engagement_rate", 0), item.get("clicks", 0)), reverse=True)[:5]

    insights = []
    if top_posts:
        winner = top_posts[0]
        insights.append(f"'{winner['title']}' é o melhor conteúdo recente: {winner.get('engagement_rate', 0)}% de engagement e {winner.get('clicks', 0)} cliques.")
    if best_formats:
        insights.append(f"{best_formats[0]['label']} está a liderar com {best_formats[0]['avg_engagement_rate']}% de engagement médio.")
    if best_weekdays:
        insights.append(f"{best_weekdays[0]['label'].capitalize()} é o melhor dia recente para alcance/clicks desta empresa.")
    if not insights:
        insights.append("Ainda não há padrões fortes; mantenha consistência para alimentar o motor de aprendizagem.")

    recommended_actions = []
    if best_formats:
        recommended_actions.append(f"Aumentar em 20-30% o volume de {best_formats[0]['label']} nos próximos 14 dias.")
    if top_posts:
        recommended_actions.append(f"Reciclar o ângulo '{top_posts[0]['theme']}' em novos conteúdos e CTA semelhantes.")
    if best_weekdays:
        recommended_actions.append(f"Reservar os slots de maior prioridade para {best_weekdays[0]['label']}." )
    if not recommended_actions:
        recommended_actions.append("Continuar a publicar para construir histórico suficiente para otimização.")

    return {
        "mocked": mocked,
        "summary": {
            "published_posts": totals["published_posts"],
            "reach": totals["reach"],
            "impressions": totals["impressions"],
            "clicks": totals["clicks"],
            "avg_engagement_rate": avg_engagement,
        },
        "top_posts": top_posts,
        "best_formats": best_formats,
        "best_weekdays": best_weekdays,
        "insights": insights,
        "recommended_actions": recommended_actions,
    }


def _fallback_marketing_briefing(user_name: str, company_name: str, analytics: dict, workflow: dict, queued: list[dict]):
    return {
        "headline": f"{company_name}: foco editorial para hoje",
        "summary": f"Olá {user_name or 'equipa'}. Tens {workflow.get('approved', 0)} conteúdos aprovados e {len(queued)} peças em fila para publicação.",
        "wins": analytics.get("insights", [])[:2],
        "risks": [
            "Evitar que conteúdos aprovados fiquem sem horário definido.",
            "Sem ligação Meta validada para insights, as métricas continuam simuladas e servem apenas para treino interno." if analytics.get("mocked", True) else "As métricas reais podem demorar algumas horas a consolidar após a publicação.",
        ],
        "actions": analytics.get("recommended_actions", [])[:3],
        "experiments": [
            "Testar o melhor formato da semana com um CTA mais direto.",
            "Repetir o melhor tema com variação de prova social.",
        ],
        "email_subject": f"Briefing Marketing Diário — {company_name}",
    }


def build_marketing_briefing_html(name: str, company_name: str, data: dict, app_url: str):
    def _list(items):
        return "".join(
            f"<li style='margin:0 0 10px 0;color:#374151;line-height:1.5'>{item}</li>" for item in items if item
        ) or "<li style='color:#6b7280'>Sem itens para hoje.</li>"

    return f"""<!DOCTYPE html><html><body style='margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;'>
    <table width='100%' cellpadding='0' cellspacing='0' style='padding:28px 0;background:#0f172a;'><tr><td align='center'>
      <table width='620' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:22px;overflow:hidden;'>
        <tr><td style='padding:28px 32px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;'>
          <div style='font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#bfdbfe;'>CEO AI 2.0 · Diretor de Marketing</div>
          <div style='font-size:28px;font-weight:700;margin-top:8px;'>{data.get('headline','Briefing Marketing')}</div>
          <div style='font-size:14px;line-height:1.6;color:#e2e8f0;margin-top:12px;'>{data.get('summary','')}</div>
        </td></tr>
        <tr><td style='padding:28px 32px;'>
          <div style='font-size:14px;color:#6b7280;margin-bottom:20px;'>Empresa ativa: <strong style='color:#111827'>{company_name}</strong> · Destinatário: <strong style='color:#111827'>{name or 'equipa'}</strong></div>
          <h3 style='margin:0 0 10px 0;color:#111827;'>O que está a resultar</h3>
          <ul style='padding-left:18px;margin:0 0 18px 0'>{_list(data.get('wins', []))}</ul>
          <h3 style='margin:0 0 10px 0;color:#111827;'>Riscos / atenção</h3>
          <ul style='padding-left:18px;margin:0 0 18px 0'>{_list(data.get('risks', []))}</ul>
          <h3 style='margin:0 0 10px 0;color:#111827;'>Ações para hoje</h3>
          <ul style='padding-left:18px;margin:0 0 18px 0'>{_list(data.get('actions', []))}</ul>
          <h3 style='margin:0 0 10px 0;color:#111827;'>Experiências sugeridas</h3>
          <ul style='padding-left:18px;margin:0 0 24px 0'>{_list(data.get('experiments', []))}</ul>
          <div style='padding:16px 18px;border-radius:16px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.6;'>
            {"As métricas deste módulo estão <strong>MOCKED</strong> até a Meta validar permissões de insights. Servem para treino editorial interno e não substituem analytics reais." if data.get('mocked_metrics', True) else "As métricas deste módulo já estão a usar sinais reais da Meta sempre que disponíveis. Alguns indicadores podem demorar a consolidar após a publicação."}
          </div>
          <div style='text-align:center;margin-top:24px;'><a href='{app_url}/marketing' style='display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700;'>Abrir o Marketing</a></div>
        </td></tr>
      </table>
    </td></tr></table></body></html>"""


async def generate_marketing_briefing(uid: str, cid: str, user_name: str, user_email: Optional[str] = None,
                                      send_email: bool = False, force: bool = False):
    today = datetime.now(timezone.utc).date().isoformat()
    if not force:
        existing = await db.marketing_briefings.find_one({"user_id": uid, "company_id": cid, "date": today}, {"_id": 0})
        if existing:
            return existing

    company = await resolve_company(uid, cid) or {}
    workflow_doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid}, {"_id": 0, "content.workflow_summary": 1, "content.brand_brain": 1})
    workflow = ((workflow_doc or {}).get("content") or {}).get("workflow_summary") or {"draft": 0, "approved": 0, "scheduled": 0, "total": 0}
    queued = await db.social_jobs.find({"user_id": uid, "company_id": cid, "status": {"$in": ["queued", "processing"]}}).sort("run_at", 1).to_list(8)
    leads = await db.crm_leads.find({"user_id": uid, "company_id": cid}, {"_id": 0, "name": 1, "stage": 1, "score": 1}).sort("score", -1).to_list(4)
    analytics = await summarize_marketing_analytics(uid, cid)
    system = (
        "És um Diretor de Marketing executivo. Lês analytics, fila editorial e contexto comercial para orientar a equipa. "
        "Português europeu, direto, humano e acionável."
    )
    prompt = (
        f"Empresa: {company.get('name') or 'Empresa'}\n"
        f"Workflow: {workflow}\n"
        f"Fila agendada: {[{'run_at': j.get('run_at'), 'caption': ((j.get('payload') or {}).get('caption') or '')[:80]} for j in queued]}\n"
        f"Leads prioritários: {leads}\n"
        f"Analytics ({'MOCKED até validar insights da Meta' if analytics.get('mocked', True) else 'com sinais reais da Meta sempre que disponíveis'}): {analytics}\n\n"
        "Devolve APENAS JSON válido com esta estrutura: "
        '{"headline":str,"summary":str,"wins":[str],"risks":[str],"actions":[str],"experiments":[str],"email_subject":str}. '
        "Quero 2-3 wins, 2-3 risks, 3 ações prioritárias e 2 experiências. Se as métricas forem simuladas, assume isso explicitamente nas recomendações."
    )
    data = await ai_json(system, prompt)
    briefing = data if isinstance(data, dict) and data.get("headline") else _fallback_marketing_briefing(user_name, company.get("name") or "Empresa", analytics, workflow, queued)
    doc = {
        "user_id": uid,
        "company_id": cid,
        "date": today,
        "company_name": company.get("name") or "Empresa",
        "mocked_metrics": analytics.get("mocked", True),
        "headline": briefing.get("headline"),
        "summary": briefing.get("summary"),
        "wins": _str_list(briefing.get("wins"), 4),
        "risks": _str_list(briefing.get("risks"), 4),
        "actions": _str_list(briefing.get("actions"), 4),
        "experiments": _str_list(briefing.get("experiments"), 3),
        "email_subject": _short(briefing.get("email_subject"), f"Briefing Marketing Diário — {company.get('name') or 'Empresa'}"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.marketing_briefings.update_one({"user_id": uid, "company_id": cid, "date": today}, {"$set": doc}, upsert=True)

    if send_email and user_email:
        app_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        html = build_marketing_briefing_html(user_name, doc["company_name"], doc, app_url)
        ok = await send_email_raw(user_email, doc["email_subject"], html)
        if not ok:
            raise HTTPException(502, "Não foi possível enviar o briefing de marketing por email")
    return doc


async def send_daily_marketing_briefings():
    today = datetime.now(timezone.utc).date().isoformat()
    cursor = db.settings.find({"email_marketing_briefing": True})
    async for settings in cursor:
        uid = settings.get("user_id")
        if not uid:
            continue
        claim = await db.settings.update_one(
            {"user_id": uid, "email_marketing_briefing": True, "last_marketing_briefing_email_date": {"$ne": today}},
            {"$set": {"last_marketing_briefing_email_date": today}},
        )
        if claim.modified_count != 1:
            continue
        try:
            user_doc = await db.users.find_one({"_id": ObjectId(uid)})
            if not user_doc:
                continue
            cid = settings.get("active_company_id") or await active_company_id(uid)
            if not cid:
                company = await db.companies.find_one({"user_id": uid}, {"_id": 1})
                cid = str(company.get("_id")) if company else None
            if not cid:
                continue
            await generate_marketing_briefing(uid, cid, user_doc.get("name", ""), user_doc.get("email"), send_email=True, force=True)
        except Exception as e:
            logger.error(f"daily marketing briefing error for {uid}: {e}")


class ImageIn(BaseModel):
    index: int


class ImageSelectIn(BaseModel):
    variant_index: int


class PostStatusIn(BaseModel):
    status: str


class MarketingBriefingIn(BaseModel):
    send_email: bool = False
    force: bool = False


class CampaignGenerateIn(BaseModel):
    objective: str
    name: str = ""
    offer: str = ""
    audience: str = ""
    notes: str = ""


@router.get("/marketing/content")
async def get_content(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    if doc and doc.get("content") and _ensure_marketing_post_media(doc.get("content") or {}):
        await db.marketing_content.update_one(
            {"user_id": uid, "company_id": cid},
            {"$set": {"content": doc.get("content"), "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    return {"content": _serialize(doc)}


@router.get("/marketing/execution")
async def get_execution(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    content_doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid}, {"_id": 0, "content.posts": 1})
    post_map = {
        post.get("id"): {
            "title": post.get("titulo"),
            "theme": post.get("tema"),
            "format": post.get("formato"),
            "status": post.get("status"),
        }
        for post in (((content_doc or {}).get("content") or {}).get("posts") or []) if post.get("id")
    }
    jobs = await db.social_jobs.find({"user_id": uid, "company_id": cid}).sort("run_at", 1).to_list(100)
    metrics = await db.marketing_post_metrics.find({"user_id": uid, "company_id": cid}).to_list(200)
    metric_map = {row.get("social_post_id"): row for row in metrics}
    queued, history = [], []
    for job in jobs:
        payload = job.get("payload") or {}
        meta = payload.get("post_meta") or post_map.get(payload.get("post_id"), {})
        item = {
            "id": job.get("_id"),
            "post_id": payload.get("post_id"),
            "title": meta.get("title") or payload.get("caption", "")[:72] or "Conteúdo agendado",
            "theme": meta.get("theme"),
            "format": meta.get("format"),
            "run_at": job.get("run_at"),
            "status": job.get("status"),
            "caption": payload.get("caption", "")[:120],
            "error": job.get("error"),
        }
        if job.get("status") in {"queued", "processing"}:
            queued.append(item)
        elif job.get("status") == "failed":
            history.append({**item, "kind": "failed", "sort_at": job.get("created_at") or job.get("run_at")})

    posts = await db.social_posts.find({"user_id": uid, "company_id": cid}).sort("created_at", -1).to_list(40)
    for post in posts:
        metrics_doc = metric_map.get(post.get("_id")) or {}
        history.append({
            "id": post.get("_id"),
            "kind": "published",
            "post_id": post.get("post_id"),
            "title": post.get("post_title") or (post_map.get(post.get("post_id"), {}) or {}).get("title") or "Conteúdo publicado",
            "theme": post.get("theme") or (post_map.get(post.get("post_id"), {}) or {}).get("theme"),
            "format": post.get("format") or (post_map.get(post.get("post_id"), {}) or {}).get("format"),
            "published_at": post.get("created_at"),
            "channels": [channel for channel, result in (post.get("results") or {}).items() if result.get("ok")],
            "caption": post.get("caption", "")[:120],
            "metrics": metrics_doc.get("metrics") or None,
            "mocked_metrics": metrics_doc.get("mocked", True),
            "sort_at": post.get("created_at"),
        })

    history = sorted(history, key=lambda item: item.get("sort_at") or "", reverse=True)[:30]
    for item in history:
        item.pop("sort_at", None)
    return {
        "summary": {
            "queued": len(queued),
            "published": len([item for item in history if item.get("kind") == "published"]),
            "failed": len([item for item in history if item.get("kind") == "failed"]),
        },
        "queued": queued,
        "history": history,
    }


@router.get("/marketing/analytics")
async def get_marketing_analytics(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    return await summarize_marketing_analytics(uid, cid)


@router.get("/marketing/campaigns")
async def get_marketing_campaigns(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    rows = await db.marketing_campaigns.find({"user_id": uid, "company_id": cid}).sort("created_at", -1).to_list(20)
    return {"campaigns": [_serialize(row) for row in rows]}


@router.post("/marketing/campaigns/generate")
async def generate_marketing_campaign(inp: CampaignGenerateIn, user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    ctx = await _ctx(uid, cid)
    objective = _normalize_objective(inp.objective)
    objective_meta = CAMPAIGN_OBJECTIVES[objective]
    system = (
        "És um estratega de marketing executivo. Criar campanhas multicanal para PMEs, com foco comercial,"
        " coerência entre canais e português europeu. Responde apenas com JSON."
    )
    prompt = (
        f"Contexto real da empresa:\n{_prompt_context(ctx)}\n\n"
        f"Objetivo da campanha: {objective_meta['label']}\n"
        f"Nome sugerido: {inp.name or 'usar um nome claro'}\n"
        f"Oferta/gancho principal: {inp.offer or 'definir conforme o contexto'}\n"
        f"Audiência prioritária: {inp.audience or 'usar ICP e CRM'}\n"
        f"Notas extra do utilizador: {inp.notes or 'sem notas extra'}\n\n"
        "Devolve APENAS JSON válido com esta estrutura: "
        '{"summary":str,"core_message":str,"audience":str,"offer":str,'
        '"channels":[{"channel":str,"format":str,"purpose":str,"hook":str,"cta":str,"distribution":str}],'
        '"kpis":[str],"experiments":[str],"launch_plan":[{"day":str,"channel":str,"action":str}],"next_actions":[str]}. '
        "Quero exatamente 4 canais, 4 passos de lançamento, 3-4 KPIs e 2 experiências."
    )
    try:
        ai_campaign = await ai_json(system, prompt)
    except Exception:
        ai_campaign = {}
    campaign = _normalize_campaign(ai_campaign or {}, ctx, inp.model_dump())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": str(uuid.uuid4()),
        "user_id": uid,
        "company_id": cid,
        **campaign,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.marketing_campaigns.insert_one(doc)
    return {"campaign": _serialize(doc)}


@router.get("/marketing/briefing")
async def get_marketing_briefing(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    return await generate_marketing_briefing(uid, cid, user.get("name", ""), user.get("email"), send_email=False, force=False)


@router.post("/marketing/briefing/generate")
async def refresh_marketing_briefing(inp: MarketingBriefingIn, user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    return await generate_marketing_briefing(uid, cid, user.get("name", ""), user.get("email"), send_email=inp.send_email, force=inp.force)


@router.post("/marketing/generate")
async def generate_content(user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    ctx = await _ctx(uid, cid)
    system = (
        "És o Diretor de Marketing (CMO) executor de um conselho executivo digital para PMEs. "
        "Crias conteúdo com contexto real de CRM, memórias estratégicas e situação financeira atual. "
        "Tens de ser específico ao setor, orientado a receita e coerente com a marca. Português europeu."
    )
    prompt = (
        f"Usa APENAS este contexto real da empresa:\n{_prompt_context(ctx)}\n\n"
        "Cria um plano editorial operativo. Devolve APENAS JSON válido com esta estrutura: "
        '{"brand":{"tom":str,"pilares":[str],"proposta_valor":str,"provas":[str],"audiencias":[str],"do_say":[str],"avoid":[str]},'
        '"biblioteca":[{"id":str,"titulo":str,"angulo":str,"objetivo":str,"pilar":str,"formatos":[str],"cta":str}],'
        '"posts":[{"id":str,"formato":str,"titulo":str,"legenda":str,"hashtags":[str],"cta":str,"dia":str,"tema":str,"objetivo":str,"pilar":str}],'
        '"calendario":[{"dia":str,"formato":str,"tema":str,"objetivo":str,"pilar":str,"post_id":str|null}]}. '
        'Regras: 1) "formato" ∈ {Post, Story, Reel}. 2) Gera 6 a 8 posts estratégicos com legendas e hashtags. 3) "biblioteca" = 4 a 6 ângulos editoriais. '
        '4) "calendario" = 14 a 30 entradas com distribuição ao longo do mês. 5) Usa as dores do ICP e as vantagens da empresa. 6) Falar em português europeu.'
    )
    ai_content = await ai_json(system, prompt) or {}
    content = _normalize_content(ai_content, ctx)
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {"user_id": uid, "company_id": cid, "content": content, "updated_at": now_iso}
    await db.marketing_content.update_one({"user_id": uid, "company_id": cid}, {"$set": doc}, upsert=True)
    return {"content": {"content": content, "updated_at": now_iso}}


@router.post("/marketing/posts/{post_id}/status")
async def update_post_status(post_id: str, inp: PostStatusIn, user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    if not doc or not doc.get("content"):
        raise HTTPException(404, "Gere os conteúdos primeiro.")
    content = doc.get("content") or {}
    _ensure_marketing_post_media(content)
    if not apply_post_status(content, post_id, inp.status):
        raise HTTPException(404, "Post não encontrado.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.marketing_content.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {"content": content, "updated_at": now_iso}},
    )
    post = next((p for p in (content.get("posts") or []) if p.get("id") == post_id), None)
    return {"ok": True, "post": post, "content": content, "updated_at": now_iso}


@router.post("/marketing/image")
async def gen_post_image(inp: ImageIn, user: dict = Depends(premium_user)):
    """Gera 3 variações de imagem para UM post estritamente alinhadas com a legenda, com o logo da empresa aplicado."""
    uid = user["id"]
    cid = await active_company_id(uid)
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    if not doc or not doc.get("content"):
        raise HTTPException(404, "Gere os conteúdos primeiro.")
    content = doc.get("content") or {}
    _ensure_marketing_post_media(content)
    posts = content.get("posts") or []
    if inp.index < 0 or inp.index >= len(posts):
        raise HTTPException(404, "Post não encontrado.")
    post = posts[inp.index]
    ctx = await _ctx(uid, cid)
    
    # 1. Gerar prompt estratégico visual analisando o post em 4 camadas (Dor, Promessa, Tom, Estado a Ilustrar)
    titulo = post.get("titulo", "")
    legenda = post.get("legenda", "")
    tema = post.get("tema", "")
    visual_prompt = await gerar_prompt_imagem_do_post(
        post={
            "hook": post.get("hook") or post.get("gancho") or titulo,
            "title": titulo,
            "caption": legenda,
            "cta": post.get("cta", ""),
            "hashtags": post.get("hashtags", "")
        },
        brand_context={
            "name": ctx.get("name", ""),
            "sector": ctx.get("sector", ""),
            "colors": ctx.get("brand_colors") or ctx.get("colors")
        }
    )
    scene_prompts = await generate_post_visual_scenes(
        titulo=titulo,
        legenda=legenda,
        tema=tema,
        sector=ctx.get("sector", ""),
        company_name=ctx.get("name", "")
    )
    
    images = await generate_marketing_images(
        prompt=visual_prompt or (scene_prompts[0] if scene_prompts else f"{titulo} {tema}"),
        scene_prompts=scene_prompts,
        number_of_images=3,
        topic_query=f"{titulo} {tema}"
    )
    logo = await db.brand_assets.find_one({"user_id": uid, "company_id": cid})
    urls = []
    for img in images:
        final_img = img
        if logo and logo.get("logo_data"):
            try:
                final_img = composite_logo(final_img, base64.b64decode(logo["logo_data"]))
            except Exception as e:
                logger.error(f"logo composite (marketing): {e}")
        urls.append(await store_public_media(uid, final_img))
    posts[inp.index]["image_variants"] = urls
    posts[inp.index]["selected_image_index"] = 0 if urls else None
    posts[inp.index]["image_url"] = urls[0] if urls else None
    posts[inp.index]["image_prompt"] = visual_prompt
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.marketing_content.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {"content": content, "updated_at": now_iso}},
    )
    return {
        "image_url": posts[inp.index]["image_url"],
        "image_variants": urls,
        "selected_image_index": posts[inp.index]["selected_image_index"],
        "image_prompt": visual_prompt
    }


@router.post("/marketing/posts/{post_id}/image/select")
async def select_post_image_variant(post_id: str, inp: ImageSelectIn, user: dict = Depends(premium_user)):
    uid = user["id"]
    cid = await active_company_id(uid)
    doc = await db.marketing_content.find_one({"user_id": uid, "company_id": cid})
    if not doc or not doc.get("content"):
        raise HTTPException(404, "Gere os conteúdos primeiro.")
    content = doc.get("content") or {}
    _ensure_marketing_post_media(content)
    post = _find_post_by_id(content, post_id)
    if not post:
        raise HTTPException(404, "Post não encontrado.")
    variants = post.get("image_variants") or []
    if not variants:
        raise HTTPException(400, "Este post ainda não tem imagens geradas.")
    if inp.variant_index < 0 or inp.variant_index >= len(variants):
        raise HTTPException(400, "Variação de imagem inválida.")
    post["selected_image_index"] = inp.variant_index
    post["image_url"] = variants[inp.variant_index]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.marketing_content.update_one(
        {"user_id": uid, "company_id": cid},
        {"$set": {"content": content, "updated_at": now_iso}},
    )
    return {
        "ok": True,
        "post_id": post_id,
        "selected_image_index": inp.variant_index,
        "image_url": post["image_url"],
        "image_variants": variants,
    }
