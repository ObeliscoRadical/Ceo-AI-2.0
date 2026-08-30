"""Apoios & Incentivos — Diretor de Apoios Digital.

Identifica apoios, incentivos governamentais, incentivos fiscais e financiamento aplicáveis
ao perfil da empresa (Portugal e Brasil), com motor de match DETERMINÍSTICO + análise por IA.

Princípios de honestidade:
- Cada oportunidade tem FONTE OFICIAL (url), entidade e DATA DE VERIFICAÇÃO da base curada.
- A elegibilidade é ESTIMADA por regras explicáveis — NUNCA é uma garantia de aprovação.
- A IA analisa apenas os factos fornecidos (catálogo curado) e não inventa requisitos/prazos.
- Não é consultoria legal nem fiscal.
"""
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional
from core import *
from models import GrantProfileInput, GrantApplicationInput

router = APIRouter()

CATALOG_VERIFIED_AT = "2026-06-01"

# ---------------------------------------------------------------------------
# Catálogo curado de apoios reais (PT + BR). Fonte oficial + data de verificação.
# type: fundo | fiscal | financiamento | europeu | regional | emprego | inovacao
# deadline: "continuo" | "consultar_aviso" | ISO date "YYYY-MM-DD"
# sizes: micro | pequena | media | grande | all
# ---------------------------------------------------------------------------
CATALOG = [
    # --------------------------- PORTUGAL ---------------------------
    {
        "id": "pt_compete_inovacao", "country": "PT", "type": "fundo",
        "title": "Sistema de Incentivos à Inovação Produtiva (Compete 2030)",
        "entity": "Compete 2030 / Portugal 2030 (IAPMEI)",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["industria", "tecnologia", "turismo", "comercio", "servicos", "construcao", "agricultura"],
        "expenses": "Investimento em novas unidades, equipamentos, digitalização e inovação de processos/produtos.",
        "amount": "Incentivo não reembolsável e/ou reembolsável até 40%-75% da despesa elegível (varia por região e dimensão).",
        "deadline": "consultar_aviso",
        "url": "https://www.compete2030.gov.pt/",
        "documents": ["IES/últimas contas", "Memória descritiva do projeto", "Orçamentos/faturas pró-forma", "Situação regularizada AT e Segurança Social", "Declaração de PME (IAPMEI)"],
        "summary": "Apoio a projetos de investimento inovador de PME em Portugal continental via avisos concorrenciais.",
    },
    {
        "id": "pt_vale_digital", "country": "PT", "type": "fundo",
        "title": "Vale Digital / Apoios à Digitalização das PME",
        "entity": "IAPMEI / Portugal 2030",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Consultoria e implementação de soluções digitais (e-commerce, gestão, presença online, cibersegurança).",
        "amount": "Apoio até 6.000€ (vale) não reembolsável, taxa até 75%.",
        "deadline": "consultar_aviso",
        "url": "https://www.iapmei.pt/",
        "documents": ["Certidão de PME", "Orçamento do fornecedor certificado", "Situação tributária e contributiva regularizada"],
        "summary": "Cheque de apoio à transformação digital de micro e pequenas empresas.",
    },
    {
        "id": "pt_sifide", "country": "PT", "type": "fiscal",
        "title": "SIFIDE II — Incentivo Fiscal à I&D Empresarial",
        "entity": "ANI — Agência Nacional de Inovação",
        "region": "national", "sizes": ["all"],
        "sectors": ["tecnologia", "industria", "servicos", "saude", "agricultura"],
        "expenses": "Despesas de Investigação & Desenvolvimento (pessoal, equipamento, contratação de I&D).",
        "amount": "Dedução à coleta de IRC até 82,5% das despesas de I&D (taxa base 32,5% + incremental 50%).",
        "deadline": "2026-05-31",
        "url": "https://sifide.ani.pt/",
        "documents": ["Candidatura no portal SIFIDE", "Descritivo dos projetos de I&D", "Contabilidade das despesas de I&D", "Declaração Modelo 22"],
        "summary": "Benefício fiscal (IRC) para empresas que investem em I&D. Candidatura anual (normalmente até maio do ano seguinte).",
    },
    {
        "id": "pt_iefp_contratacao", "country": "PT", "type": "emprego",
        "title": "Apoios à Contratação (Compromisso Emprego Sustentável)",
        "entity": "IEFP — Instituto do Emprego e Formação Profissional",
        "region": "national", "sizes": ["all"],
        "sectors": ["all"],
        "expenses": "Contratação sem termo de desempregados/jovens; apoio financeiro por posto de trabalho criado.",
        "amount": "Apoio até 12x a retribuição mínima (majorações para grupos prioritários e territórios do interior).",
        "deadline": "continuo",
        "url": "https://www.iefp.pt/apoios-a-contratacao",
        "documents": ["Candidatura no iefponline", "Contrato de trabalho sem termo", "Situação regularizada AT e SS"],
        "summary": "Apoio financeiro à criação líquida de emprego por contrato sem termo.",
    },
    {
        "id": "pt_bpf_garantia", "country": "PT", "type": "financiamento",
        "title": "Linhas de Crédito com Garantia Mútua",
        "entity": "Banco Português de Fomento",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Financiamento de tesouraria e investimento com garantia pública (redução da taxa e do colateral exigido).",
        "amount": "Crédito bancário com garantia até 80% do capital em dívida e comissões bonificadas.",
        "deadline": "continuo",
        "url": "https://www.bpfomento.pt/",
        "documents": ["Pedido junto do banco aderente", "Últimas contas (IES)", "Plano de investimento/tesouraria", "Situação regularizada"],
        "summary": "Acesso a crédito com garantia mútua do Estado para PME viáveis.",
    },
    {
        "id": "pt_turismo_qualificacao", "country": "PT", "type": "financiamento",
        "title": "Linha de Apoio à Qualificação da Oferta Turística",
        "entity": "Turismo de Portugal",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["turismo", "restauracao", "hotelaria"],
        "expenses": "Requalificação de empreendimentos turísticos, restauração e animação; eficiência e digitalização.",
        "amount": "Financiamento sem juros (parte convertível em incentivo não reembolsável até 50%).",
        "deadline": "consultar_aviso",
        "url": "https://www.turismodeportugal.pt/",
        "documents": ["Registo no Turismo de Portugal", "Projeto/investimento detalhado", "Licenciamento da atividade", "Situação regularizada"],
        "summary": "Apoio ao setor do turismo, hotelaria e restauração para requalificar a oferta.",
    },
    {
        "id": "pt_compete_internacionalizacao", "country": "PT", "type": "fundo",
        "title": "Internacionalização das PME (Compete 2030)",
        "entity": "Compete 2030 / AICEP / IAPMEI",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["industria", "comercio", "tecnologia", "servicos", "agricultura"],
        "expenses": "Presença em feiras internacionais, prospeção de mercados, marketing internacional, certificações.",
        "amount": "Incentivo não reembolsável até 50% das despesas elegíveis de internacionalização.",
        "deadline": "consultar_aviso",
        "url": "https://www.compete2030.gov.pt/",
        "documents": ["Certidão de PME", "Plano de internacionalização", "Orçamentos", "Situação regularizada"],
        "summary": "Apoio a PME que querem exportar e crescer em mercados externos.",
    },
    {
        "id": "pt_prr_capitalizar", "country": "PT", "type": "europeu",
        "title": "PRR — Apoios à Capitalização e Transição Verde/Digital",
        "entity": "Recuperar Portugal (PRR)",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Descarbonização, eficiência energética, economia circular e transição digital das empresas.",
        "amount": "Subvenções e instrumentos financeiros (varia por aviso/componente do PRR).",
        "deadline": "consultar_aviso",
        "url": "https://recuperarportugal.gov.pt/",
        "documents": ["Candidatura no Balcão dos Fundos", "Memória descritiva", "Orçamentos", "Situação regularizada"],
        "summary": "Fundos do Plano de Recuperação e Resiliência para transição verde e digital.",
    },
    {
        "id": "pt_iapmei_crescer", "country": "PT", "type": "inovacao",
        "title": "Programa Consultores para o Crescimento",
        "entity": "IAPMEI",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Consultoria especializada em estratégia, gestão, finanças e crescimento da empresa.",
        "amount": "Acesso a consultoria com comparticipação; formação e mentoria para PME.",
        "deadline": "continuo",
        "url": "https://www.iapmei.pt/",
        "documents": ["Inscrição no IAPMEI", "Diagnóstico da empresa"],
        "summary": "Apoio à capacitação e crescimento estruturado de PME com consultores certificados.",
    },
    {
        "id": "pt_startup_portugal", "country": "PT", "type": "inovacao",
        "title": "Startup Portugal — Programas para Empreendedores",
        "entity": "Startup Portugal",
        "region": "national", "sizes": ["micro", "pequena"],
        "sectors": ["tecnologia", "servicos", "industria"],
        "expenses": "Aceleração, incubação, acesso a investidores e apoios ao arranque de startups.",
        "amount": "Programas de aceleração, Vale Incubação e ligação a capital de risco.",
        "deadline": "continuo",
        "url": "https://startupportugal.com/",
        "documents": ["Pitch/plano de negócio", "Constituição da empresa"],
        "summary": "Ecossistema de apoio a startups e negócios inovadores em fase inicial.",
    },
    # --------------------------- BRASIL ---------------------------
    {
        "id": "br_pronampe", "country": "BR", "type": "financiamento",
        "title": "Pronampe — Crédito para Micro e Pequenas Empresas",
        "entity": "Governo Federal (bancos parceiros)",
        "region": "national", "sizes": ["micro", "pequena"],
        "sectors": ["all"],
        "expenses": "Capital de giro e investimento com garantia do FGO (Fundo Garantidor de Operações).",
        "amount": "Até 30% do faturamento anual, com taxa reduzida (Selic + até 6% a.a.) e prazos alongados.",
        "deadline": "continuo",
        "url": "https://www.gov.br/empresas-e-negocios/pt-br/pronampe",
        "documents": ["CNPJ ativo", "Faturamento do ano anterior", "Conta no banco parceiro", "Regularidade fiscal"],
        "summary": "Linha de crédito nacional para micro e pequenas empresas com garantia pública.",
    },
    {
        "id": "br_bndes_credito", "country": "BR", "type": "financiamento",
        "title": "BNDES Crédito Pequenas Empresas / Finame",
        "entity": "BNDES",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Investimento em máquinas, equipamentos, obras e capital de giro associado.",
        "amount": "Financiamento de longo prazo com taxas competitivas (via agentes financeiros credenciados).",
        "deadline": "continuo",
        "url": "https://www.bndes.gov.br/",
        "documents": ["CNPJ", "Projeto de investimento", "Demonstrações contábeis", "Cadastro em banco credenciado"],
        "summary": "Financiamento do banco de desenvolvimento para investimento produtivo.",
    },
    {
        "id": "br_lei_do_bem", "country": "BR", "type": "fiscal",
        "title": "Lei do Bem — Incentivo Fiscal à Inovação",
        "entity": "MCTI (Lei nº 11.196/2005)",
        "region": "national", "sizes": ["media", "grande"],
        "sectors": ["tecnologia", "industria", "servicos", "saude", "agricultura"],
        "expenses": "Despesas com Pesquisa, Desenvolvimento e Inovação Tecnológica (P&D&I).",
        "amount": "Dedução adicional de 60% a 100% das despesas de P&D no cálculo do IRPJ/CSLL (lucro real).",
        "deadline": "2026-07-31",
        "url": "https://www.gov.br/mcti/pt-br",
        "documents": ["Empresa no regime de Lucro Real", "Descritivo dos projetos de P&D", "Escrituração das despesas", "Formulário MCTI anual"],
        "summary": "Benefício fiscal para empresas tributadas pelo Lucro Real que investem em inovação.",
    },
    {
        "id": "br_finep_inovacao", "country": "BR", "type": "inovacao",
        "title": "FINEP — Financiamento e Subvenção à Inovação",
        "entity": "FINEP (Ministério da Ciência e Tecnologia)",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["tecnologia", "industria", "saude", "servicos"],
        "expenses": "Projetos de inovação, desenvolvimento de produtos e processos tecnológicos.",
        "amount": "Crédito com juros baixos e editais de subvenção econômica (recurso não reembolsável).",
        "deadline": "consultar_aviso",
        "url": "http://www.finep.gov.br/",
        "documents": ["Cadastro na FINEP", "Plano de projeto de inovação", "Demonstrações contábeis"],
        "summary": "Agência federal de fomento à inovação com crédito e subvenção para empresas.",
    },
    {
        "id": "br_sebrae", "country": "BR", "type": "inovacao",
        "title": "Sebrae — Consultorias e Programas de Apoio",
        "entity": "Sebrae",
        "region": "national", "sizes": ["micro", "pequena"],
        "sectors": ["all"],
        "expenses": "Consultoria em gestão, marketing, finanças, inovação e acesso a mercados.",
        "amount": "Consultorias subsidiadas (ex.: Sebraetec), capacitação e mentorias a baixo custo.",
        "deadline": "continuo",
        "url": "https://sebrae.com.br/",
        "documents": ["CNPJ ativo", "Cadastro no Sebrae da sua região"],
        "summary": "Apoio técnico e capacitação para micro e pequenas empresas em todo o Brasil.",
    },
    {
        "id": "br_cartao_bndes", "country": "BR", "type": "financiamento",
        "title": "Cartão BNDES — Crédito Rotativo para MPME",
        "entity": "BNDES",
        "region": "national", "sizes": ["micro", "pequena", "media"],
        "sectors": ["all"],
        "expenses": "Compra de insumos, máquinas e serviços credenciados no portal do Cartão BNDES.",
        "amount": "Limite de crédito pré-aprovado com taxas mensais reduzidas e parcelamento.",
        "deadline": "continuo",
        "url": "https://www.cartaobndes.gov.br/",
        "documents": ["CNPJ", "Solicitação em banco emissor", "Regularidade fiscal"],
        "summary": "Linha de crédito rotativo para financiar operações e investimentos de MPME.",
    },
    {
        "id": "br_fampe", "country": "BR", "type": "financiamento",
        "title": "FAMPE — Fundo de Aval às Micro e Pequenas Empresas",
        "entity": "Sebrae",
        "region": "national", "sizes": ["micro", "pequena"],
        "sectors": ["all"],
        "expenses": "Complemento de garantia para obtenção de crédito bancário por MPE sem colateral suficiente.",
        "amount": "Garante parte do financiamento (aval), facilitando a aprovação do crédito no banco.",
        "deadline": "continuo",
        "url": "https://sebrae.com.br/sites/PortalSebrae/artigos/fampe",
        "documents": ["CNPJ", "Proposta de crédito no banco parceiro", "Cadastro Sebrae"],
        "summary": "Fundo de aval que ajuda micro e pequenas empresas a conseguir crédito.",
    },
    {
        "id": "br_simples", "country": "BR", "type": "fiscal",
        "title": "Simples Nacional — Regime Tributário Simplificado",
        "entity": "Receita Federal",
        "region": "national", "sizes": ["micro", "pequena"],
        "sectors": ["all"],
        "expenses": "Não é um subsídio: é um regime que reduz e unifica a carga tributária de MPE elegíveis.",
        "amount": "Recolhimento unificado de tributos com alíquotas reduzidas conforme o faturamento.",
        "deadline": "continuo",
        "url": "https://www8.receita.fazenda.gov.br/SimplesNacional/",
        "documents": ["CNPJ", "Faturamento dentro do limite anual", "Opção pelo regime no portal"],
        "summary": "Regime tributário que reduz impostos de micro e pequenas empresas elegíveis.",
    },
]

CATALOG_BY_ID = {g["id"]: g for g in CATALOG}

TYPE_LABEL = {
    "fundo": "Incentivo / Fundo", "fiscal": "Incentivo Fiscal", "financiamento": "Financiamento",
    "europeu": "Fundos Europeus", "regional": "Programa Regional", "emprego": "Apoio ao Emprego",
    "inovacao": "Inovação / Capacitação",
}
SIZE_LABEL = {"micro": "Microempresa", "pequena": "Pequena empresa", "media": "Média empresa",
              "grande": "Grande empresa", "all": "Qualquer dimensão"}


# ---------------------------------------------------------------------------
# Perfil de elegibilidade (reutiliza dados existentes + campos extra guardados)
# ---------------------------------------------------------------------------
def _company_size(employees: int, revenue: float):
    """Definição PME (aproximada, critério UE por nº de trabalhadores e volume de negócios)."""
    e = employees or 0
    r = revenue or 0
    if e == 0 and r == 0:
        return None
    if e < 10 and r <= 2_000_000:
        return "micro"
    if e < 50 and r <= 10_000_000:
        return "pequena"
    if e < 250 and r <= 50_000_000:
        return "media"
    return "grande"


async def _eligibility_profile(uid: str, cid):
    snap = await build_snapshot(uid)
    company = await resolve_company(uid) or {}
    prof = company.get("profile", {}) or {}
    val = snap.get("valuation", {}) or {}
    extra = await db.grants_profiles.find_one({"user_id": uid, "company_id": cid}) or {}
    country = extra.get("focus_country") or ("BR" if company.get("region") == "BR" else "PT")
    employees = int(company.get("employees_count", 0) or 0)
    revenue = val.get("annual_revenue")
    if not isinstance(revenue, (int, float)):
        revenue = (float(prof.get("monthly_revenue", 0) or 0) * 12) or None
    size = _company_size(employees, revenue or 0)
    sector = company.get("sector") or prof.get("activity") or ""
    p = {
        "country": country,
        "company_name": company.get("name") or snap.get("company_name") or "A empresa",
        "sector": sector,
        "cae": prof.get("cae") or "",
        "region_label": company.get("region", "PT"),
        "employees": employees,
        "annual_revenue": revenue,
        "size": size,
        "size_label": SIZE_LABEL.get(size) if size else None,
        "currency_symbol": snap.get("currency_symbol", "€"),
        "main_goal": prof.get("main_goal") or "",
        "investment_amount": extra.get("investment_amount"),
        "project_type": extra.get("project_type") or "",
        "interests": extra.get("interests") or [],
    }
    missing = []
    if not sector:
        missing.append({"field": "sector", "label": "Setor de atividade / CAE"})
    if size is None:
        missing.append({"field": "size", "label": "Nº de trabalhadores e/ou faturação anual"})
    if not extra.get("investment_amount"):
        missing.append({"field": "investment_amount", "label": "Montante de investimento pretendido"})
    if not extra.get("project_type"):
        missing.append({"field": "project_type", "label": "Tipo de projeto (ex.: digitalização, contratação, expansão)"})
    p["missing"] = missing
    return p


def _sector_matches(company_sector: str, grant_sectors):
    if "all" in grant_sectors:
        return "all"
    s = (company_sector or "").lower()
    if not s:
        return None
    for tag in grant_sectors:
        if tag in s or s in tag:
            return tag
    # mapeamento de sinónimos comuns
    syn = {
        "restaur": "restauracao", "café": "restauracao", "hotel": "hotelaria", "aloj": "hotelaria",
        "software": "tecnologia", "informát": "tecnologia", "digital": "tecnologia", "app": "tecnologia",
        "loja": "comercio", "retalho": "comercio", "venda": "comercio", "varejo": "comercio",
        "obra": "construcao", "constru": "construcao", "eletric": "construcao", "canaliz": "construcao",
        "clínic": "saude", "médic": "saude", "saúde": "saude", "farmác": "saude",
        "fábric": "industria", "produç": "industria", "fabrico": "industria", "metal": "industria",
        "consult": "servicos", "serviç": "servicos", "agênc": "servicos",
        "agri": "agricultura", "quinta": "agricultura", "farm": "agricultura",
    }
    for key, tag in syn.items():
        if key in s and tag in grant_sectors:
            return tag
    return None


def _match_one(grant, prof):
    score = 0
    reasons = []
    warns = []
    # setor
    sm = _sector_matches(prof.get("sector"), grant["sectors"])
    if sm == "all":
        score += 12
        reasons.append("Aberto a empresas de qualquer setor")
    elif sm:
        score += 32
        reasons.append(f"Setor compatível ({prof.get('sector')})")
    elif not prof.get("sector"):
        warns.append("Indica o teu setor para confirmar a elegibilidade")
    else:
        return None  # setor não elegível → não mostrar
    # dimensão
    size = prof.get("size")
    if "all" in grant["sizes"]:
        score += 18
        reasons.append("Aberto a qualquer dimensão de empresa")
    elif size and size in grant["sizes"]:
        score += 26
        reasons.append(f"Dimensão elegível ({SIZE_LABEL.get(size)})")
    elif size and size not in grant["sizes"]:
        # dimensão fora do alvo: penaliza mas não elimina (o utilizador pode confirmar)
        score += 4
        warns.append(f"Dirigido a {', '.join(SIZE_LABEL.get(s, s) for s in grant['sizes'])} — confirma a tua dimensão")
    else:
        score += 6
        warns.append("Confirma a dimensão da empresa (nº de trabalhadores/faturação)")
    # prazo
    dl = grant["deadline"]
    if dl == "continuo":
        score += 16
        reasons.append("Candidaturas em contínuo")
    elif dl == "consultar_aviso":
        score += 8
        warns.append("Depende de aviso concorrencial — verifica prazos no site oficial")
    else:
        score += 10
        reasons.append(f"Prazo indicativo: {dl}")
    # interesses / tipo de projeto
    interests = prof.get("interests") or []
    if grant["type"] in interests:
        score += 12
        reasons.append(f"Corresponde ao teu interesse ({TYPE_LABEL.get(grant['type'])})")
    # intenção de investimento vs financiamento/fundo
    if prof.get("investment_amount") and grant["type"] in ("financiamento", "fundo", "europeu"):
        score += 6
        reasons.append("Adequado ao investimento que pretendes fazer")
    score = min(100, score)
    if score >= 62:
        elig = "elegivel"; elig_label = "Elegível (a confirmar requisitos)"
    elif score >= 40:
        elig = "possivel"; elig_label = "Possivelmente elegível"
    else:
        elig = "confirmar"; elig_label = "Requisitos a confirmar"
    return {
        **grant,
        "type_label": TYPE_LABEL.get(grant["type"], grant["type"]),
        "size_labels": [SIZE_LABEL.get(s, s) for s in grant["sizes"]],
        "verified_at": CATALOG_VERIFIED_AT,
        "score": score, "eligibility": elig, "eligibility_label": elig_label,
        "match_reasons": reasons, "warnings": warns,
    }


def _match_all(prof, country):
    out = []
    for g in CATALOG:
        if g["country"] != country:
            continue
        m = _match_one(g, prof)
        if m:
            out.append(m)
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Endpoints — perfil
# ---------------------------------------------------------------------------
@router.get("/grants/profile")
async def get_grants_profile(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    prof = await _eligibility_profile(uid, cid)
    return {"profile": prof, "countries": [{"code": "PT", "label": "Portugal"}, {"code": "BR", "label": "Brasil"}]}


@router.post("/grants/profile")
async def save_grants_profile(user: dict = Depends(premium_user), body: GrantProfileInput = Body(...)):
    uid = user["id"]; cid = await active_company_id(uid)
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if upd:
        upd.update({"user_id": uid, "company_id": cid})
        await db.grants_profiles.update_one({"user_id": uid, "company_id": cid}, {"$set": upd}, upsert=True)
    prof = await _eligibility_profile(uid, cid)
    return {"ok": True, "profile": prof}


# ---------------------------------------------------------------------------
# Endpoints — oportunidades (motor determinístico, sem IA)
# ---------------------------------------------------------------------------
@router.get("/grants/opportunities")
async def opportunities(country: Optional[str] = None, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    prof = await _eligibility_profile(uid, cid)
    c = (country or prof["country"] or "PT").upper()
    if c not in ("PT", "BR"):
        c = "PT"
    opps = _match_all(prof, c)
    tracked = {a["grant_id"] async for a in db.grant_applications.find(
        {"user_id": uid, "company_id": cid}, {"grant_id": 1})}
    for o in opps:
        o["tracked"] = o["id"] in tracked
    return {"country": c, "profile": prof, "opportunities": opps,
            "verified_at": CATALOG_VERIFIED_AT, "total": len(opps)}


# ---------------------------------------------------------------------------
# Endpoints — análise do Diretor de Apoios (IA, cache diária)
# ---------------------------------------------------------------------------
@router.post("/grants/analyze")
async def analyze(country: Optional[str] = Body(None, embed=True), user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    prof = await _eligibility_profile(uid, cid)
    c = (country or prof["country"] or "PT").upper()
    opps = _match_all(prof, c)[:6]
    if not opps:
        return {"analysis": None, "reason": "no_opportunities"}
    sym = prof["currency_symbol"]
    facts = [{
        "id": o["id"], "titulo": o["title"], "entidade": o["entity"], "tipo": o["type_label"],
        "montante": o["amount"], "prazo": o["deadline"], "elegibilidade": o["eligibility_label"],
        "despesas_elegiveis": o["expenses"], "documentos": o["documents"], "fonte": o["url"],
    } for o in opps]
    prof_txt = (
        f"Empresa: {prof['company_name']} · País de foco: {c} · Setor: {prof.get('sector') or 'n/d'} "
        f"· Dimensão: {prof.get('size_label') or 'n/d'} · Nº trabalhadores: {prof.get('employees')} "
        f"· Faturação anual: {prof.get('annual_revenue') or 'n/d'} · Objetivo: {prof.get('main_goal') or 'n/d'} "
        f"· Investimento pretendido: {prof.get('investment_amount') or 'n/d'} "
        f"· Tipo de projeto: {prof.get('project_type') or 'n/d'}"
    )
    lacunas = "; ".join(m["label"] for m in prof.get("missing", [])) or "nenhuma relevante"
    system = (
        "És o Diretor de Apoios e Incentivos de um conselho executivo digital para PMEs. Ajudas a empresa a "
        "identificar e conquistar apoios públicos, incentivos fiscais e financiamento. Português europeu (ou do Brasil "
        "se o país de foco for BR). Rigoroso e prático. NUNCA inventes apoios, prazos, montantes ou requisitos que não "
        "estejam nos FACTOS fornecidos. NUNCA garantas aprovação — fala sempre em elegibilidade estimada. Não dás "
        "consultoria legal nem fiscal formal; recomendas confirmar nas fontes oficiais."
    )
    prompt = (
        f"PERFIL DA EMPRESA:\n{prof_txt}\n\nLACUNAS DE INFORMAÇÃO NO PERFIL: {lacunas}\n\n"
        f"OPORTUNIDADES FILTRADAS (usa APENAS estes factos):\n{json.dumps(facts, ensure_ascii=False)}\n\n"
        "Devolve APENAS JSON válido no formato: "
        '{"resumo":str,"prioridade":str,"lacunas":[str],'
        '"oportunidades":[{"id":str,"porque_encaixa":str,"passos":[str],"documentos_chave":[str],"onde_tratar":str}],'
        '"proximo_passo":str,"aviso":str}. '
        '"resumo": 2-3 frases sobre o cenário de apoios para esta empresa. '
        '"prioridade": qual apoio atacar primeiro e porquê (usa o id/titulo). '
        '"lacunas": o que a empresa deve completar no perfil para reforçar candidaturas. '
        '"oportunidades": para CADA id recebido, "porque_encaixa" (liga ao perfil), "passos" (3-5 passos concretos da candidatura), '
        '"documentos_chave" (dos documentos fornecidos), "onde_tratar" (entidade + indica que o link oficial está na ficha). '
        '"proximo_passo": a ação mais imediata. "aviso": frase a lembrar que é estimativa e que deve confirmar prazos/regras na fonte oficial.'
    )
    analysis = await cached_ai(f"grants_{c}", uid, cid, system, prompt)
    return {"analysis": analysis, "country": c, "opportunities": opps}


# ---------------------------------------------------------------------------
# Endpoints — gestão de candidaturas
# ---------------------------------------------------------------------------
APP_STATUSES = ["a_preparar", "submetida", "em_analise", "aprovada", "recusada"]
STATUS_LABEL = {"a_preparar": "A preparar", "submetida": "Submetida", "em_analise": "Em análise",
                "aprovada": "Aprovada", "recusada": "Recusada"}


def _serialize_app(doc):
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc["status_label"] = STATUS_LABEL.get(doc.get("status"), doc.get("status"))
    return doc


def _oid(aid):
    try:
        return ObjectId(aid)
    except Exception:
        raise HTTPException(404, "Candidatura não encontrada.")


@router.get("/grants/applications")
async def list_apps(user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    docs = await db.grant_applications.find({"user_id": uid, "company_id": cid}).sort("created_at", -1).to_list(100)
    return {"applications": [_serialize_app(d) for d in docs], "statuses":
            [{"code": s, "label": STATUS_LABEL[s]} for s in APP_STATUSES]}


@router.get("/grants/applications/{aid}")
async def get_app(aid: str, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    doc = await db.grant_applications.find_one({"_id": _oid(aid), "user_id": uid, "company_id": cid})
    if not doc:
        raise HTTPException(404, "Candidatura não encontrada.")
    app = _serialize_app(doc)
    g = CATALOG_BY_ID.get(doc.get("grant_id")) or {}
    grant = None
    if g:
        grant = {"amount": g.get("amount"), "expenses": g.get("expenses"), "summary": g.get("summary"),
                 "deadline": g.get("deadline"), "region": g.get("region"),
                 "size_labels": [SIZE_LABEL.get(s, s) for s in g.get("sizes", [])],
                 "verified_at": CATALOG_VERIFIED_AT}
    company = await resolve_company(uid) or {}
    return {"application": app, "grant": grant, "company_name": company.get("name") or "A empresa"}


@router.post("/grants/applications")
async def start_app(user: dict = Depends(premium_user), grant_id: str = Body(..., embed=True)):
    uid = user["id"]; cid = await active_company_id(uid)
    grant = CATALOG_BY_ID.get(grant_id)
    if not grant:
        raise HTTPException(404, "Apoio não encontrado.")
    existing = await db.grant_applications.find_one({"user_id": uid, "company_id": cid, "grant_id": grant_id})
    if existing:
        return {"ok": True, "application": _serialize_app(existing), "already": True}
    checklist = [{"label": d, "done": False} for d in grant["documents"]]
    steps = [
        {"label": "Confirmar elegibilidade e prazos na fonte oficial", "done": False},
        {"label": "Reunir a documentação necessária", "done": False},
        {"label": f"Submeter a candidatura junto de {grant['entity']}", "done": False},
        {"label": "Acompanhar a decisão e responder a pedidos de esclarecimento", "done": False},
    ]
    doc = {
        "user_id": uid, "company_id": cid, "grant_id": grant_id,
        "title": grant["title"], "entity": grant["entity"], "url": grant["url"],
        "type_label": TYPE_LABEL.get(grant["type"], grant["type"]),
        "status": "a_preparar", "deadline": None, "notes": "",
        "checklist": checklist, "steps": steps, "files": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.grant_applications.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"ok": True, "application": _serialize_app(doc)}


@router.patch("/grants/applications/{aid}")
async def update_app(aid: str, user: dict = Depends(premium_user), body: GrantApplicationInput = Body(...)):
    uid = user["id"]; cid = await active_company_id(uid)
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "status" in upd and upd["status"] not in APP_STATUSES:
        raise HTTPException(400, "Estado inválido.")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "deadline" in upd:
        upd["emailed_deadline_days"] = []  # re-arma avisos de email para o novo prazo
    r = await db.grant_applications.update_one(
        {"_id": _oid(aid), "user_id": uid, "company_id": cid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Candidatura não encontrada.")
    doc = await db.grant_applications.find_one({"_id": _oid(aid)})
    return {"ok": True, "application": _serialize_app(doc)}


@router.post("/grants/applications/{aid}/toggle")
async def toggle_item(aid: str, user: dict = Depends(premium_user),
                      kind: str = Body(..., embed=True), index: int = Body(..., embed=True)):
    uid = user["id"]; cid = await active_company_id(uid)
    if kind not in ("checklist", "steps"):
        raise HTTPException(400, "kind inválido.")
    doc = await db.grant_applications.find_one({"_id": _oid(aid), "user_id": uid, "company_id": cid})
    if not doc:
        raise HTTPException(404, "Candidatura não encontrada.")
    items = doc.get(kind) or []
    if not (0 <= index < len(items)):
        raise HTTPException(400, "Índice inválido.")
    items[index]["done"] = not items[index].get("done")
    await db.grant_applications.update_one({"_id": doc["_id"]},
                                           {"$set": {kind: items, "updated_at": datetime.now(timezone.utc).isoformat()}})
    doc[kind] = items
    return {"ok": True, "application": _serialize_app(doc)}


@router.delete("/grants/applications/{aid}")
async def delete_app(aid: str, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    await db.grant_applications.delete_one({"_id": _oid(aid), "user_id": uid, "company_id": cid})
    await db.grant_files.delete_many({"user_id": uid, "app_id": aid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Documentos anexados a uma candidatura (guardados no Mongo, servidos com auth)
# ---------------------------------------------------------------------------
MAX_GRANT_FILE = 10 * 1024 * 1024  # 10 MB


async def _get_app(uid, cid, aid):
    doc = await db.grant_applications.find_one({"_id": _oid(aid), "user_id": uid, "company_id": cid})
    if not doc:
        raise HTTPException(404, "Candidatura não encontrada.")
    return doc


@router.post("/grants/applications/{aid}/documents")
async def upload_app_document(aid: str, file: UploadFile = File(...), user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    await _get_app(uid, cid, aid)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Ficheiro vazio.")
    if len(data) > MAX_GRANT_FILE:
        raise HTTPException(400, "Ficheiro demasiado grande (máx. 10 MB).")
    fid = str(uuid.uuid4())
    ct = file.content_type or "application/octet-stream"
    await db.grant_files.insert_one({
        "_id": fid, "user_id": uid, "company_id": cid, "app_id": aid,
        "filename": file.filename or "documento", "content_type": ct, "size": len(data),
        "data": base64.b64encode(data).decode(), "created_at": datetime.now(timezone.utc).isoformat()})
    meta = {"id": fid, "filename": file.filename or "documento", "content_type": ct,
            "size": len(data), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.grant_applications.update_one(
        {"_id": _oid(aid)}, {"$push": {"files": meta}, "$set": {"updated_at": meta["created_at"]}})
    doc = await db.grant_applications.find_one({"_id": _oid(aid)})
    return {"ok": True, "application": _serialize_app(doc)}


@router.get("/grants/applications/{aid}/documents/{fid}")
async def download_app_document(aid: str, fid: str, user: dict = Depends(premium_user)):
    uid = user["id"]
    f = await db.grant_files.find_one({"_id": fid, "user_id": uid, "app_id": aid})
    if not f:
        raise HTTPException(404, "Documento não encontrado.")
    raw = base64.b64decode(f["data"])
    from urllib.parse import quote
    fn = quote(f.get("filename", "documento"))
    return StreamingResponse(iter([raw]), media_type=f.get("content_type", "application/octet-stream"),
                             headers={"Content-Disposition": f"inline; filename*=UTF-8''{fn}"})


@router.delete("/grants/applications/{aid}/documents/{fid}")
async def delete_app_document(aid: str, fid: str, user: dict = Depends(premium_user)):
    uid = user["id"]; cid = await active_company_id(uid)
    await db.grant_files.delete_one({"_id": fid, "user_id": uid, "app_id": aid})
    await db.grant_applications.update_one(
        {"_id": _oid(aid), "user_id": uid, "company_id": cid},
        {"$pull": {"files": {"id": fid}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    doc = await db.grant_applications.find_one({"_id": _oid(aid)})
    return {"ok": True, "application": _serialize_app(doc) if doc else None}


# ---------------------------------------------------------------------------
# Alertas de prazos de candidaturas (in-app + push + email)
# ---------------------------------------------------------------------------
DEADLINE_MILESTONES = [14, 7, 3, 1]


def build_grant_deadline_html(name, app, days, deadline, app_url):
    who = f", {name}" if name else ""
    urgency = "#EF4444" if days <= 3 else "#F59E0B"
    plural = "dia" if days == 1 else "dias"
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#0b0c10;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0c10;padding:32px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr><td style="background:#0b0c10;padding:28px 32px;">
            <div style="color:#3B82F6;font-size:22px;font-weight:700;letter-spacing:1px;">CEO&nbsp;AI</div>
            <div style="color:#a1a1aa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Executivo Digital · Apoios &amp; Incentivos</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <div style="font-size:13px;color:#71717a;margin-bottom:6px;">Prazo a aproximar-se{who}</div>
            <div style="font-size:23px;color:#18181b;font-weight:800;line-height:1.3;margin-bottom:10px;">{app.get('title','')}</div>
            <div style="font-size:16px;color:{urgency};font-weight:700;margin-bottom:16px;">Faltam {days} {plural} — prazo {deadline}</div>
            <div style="font-size:14px;color:#52525b;line-height:1.6;margin-bottom:8px;">Entidade: <strong>{app.get('entity','')}</strong></div>
            <div style="font-size:14px;color:#52525b;line-height:1.6;margin-bottom:22px;">Não percas o prazo desta candidatura que estás a acompanhar. Confirma a documentação e submete a tempo no portal oficial.</div>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
              <a href="{app_url}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:999px;">Ver a minha candidatura</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#faf9f6;border-top:1px solid #eee;">
            <div style="font-size:11px;color:#a1a1aa;">Recebes este aviso porque estás a acompanhar candidaturas a apoios no CEO AI 2.0. Podes desativar em Personalização. A elegibilidade é uma estimativa; confirma sempre requisitos e prazos na fonte oficial.</div>
          </td></tr>
        </table>
      </td></tr>
    </table></body></html>"""


async def evaluate_grant_alerts(only_user: Optional[str] = None):
    created = 0
    q = {"deadline": {"$ne": None}, "status": {"$in": ["a_preparar", "submetida", "em_analise"]}}
    if only_user:
        q["user_id"] = only_user
    now = datetime.now(timezone.utc)
    cutoff20 = (now - timedelta(hours=20)).isoformat()
    async for app in db.grant_applications.find(q):
        try:
            dl = datetime.fromisoformat(str(app["deadline"])[:10]).replace(tzinfo=timezone.utc)
        except Exception:
            continue
        days = (dl.date() - now.date()).days
        if days < 0 or days > 30:
            continue
        uid = app["user_id"]; cid = app.get("company_id")
        # ---- notificação in-app + push (dedup 20h) ----
        recent = await db.notifications.find_one({
            "user_id": uid, "type": "apoio_prazo", "data.app_id": str(app["_id"]),
            "status": {"$in": ["unread", "read"]}, "created_at": {"$gt": cutoff20}})
        if not recent:
            title = "Prazo de apoio a aproximar-se"
            body = f"A candidatura '{app['title']}' fecha em {days} dia(s) ({app['deadline']}). Prepara a submissão."
            data = {"app_id": str(app["_id"]), "grant_id": app.get("grant_id"), "days": days, "route": "/apoios"}
            doc = {"user_id": uid, "company_id": cid, "type": "apoio_prazo", "title": title, "body": body,
                   "data": data, "status": "unread", "snooze_until": None, "created_at": now.isoformat()}
            res = await db.notifications.insert_one(doc)
            try:
                await send_push_to_user(uid, title, body, url="/apoios",
                                        actions=[{"action": "approve", "title": "Ver candidatura"},
                                                 {"action": "snooze", "title": "Lembrar depois"}],
                                        extra={"notif_id": str(res.inserted_id)})
            except Exception as e:
                logger.error(f"push apoio prazo: {e}")
            created += 1
        # ---- email por marcos (14/7/3/1 dias), uma vez cada ----
        try:
            bucket = min((m for m in DEADLINE_MILESTONES if days <= m), default=None)
            emailed = app.get("emailed_deadline_days") or []
            if bucket is not None and bucket not in emailed:
                s = await db.settings.find_one({"user_id": uid}) or {}
                if s.get("email_grant_alerts", True) is not False:
                    u = await db.users.find_one({"_id": ObjectId(uid)})
                    if u and u.get("email"):
                        html = build_grant_deadline_html(u.get("name", ""), app, days, app["deadline"],
                                                         os.environ.get("FRONTEND_URL", ""))
                        ok = await send_email_raw(u["email"], f"Prazo de apoio: {app['title']} (faltam {days} dia(s))", html)
                        if ok:
                            await db.grant_applications.update_one(
                                {"_id": app["_id"]}, {"$addToSet": {"emailed_deadline_days": bucket}})
        except Exception as e:
            logger.error(f"email apoio prazo: {e}")
    return created


@router.post("/grants/run-alert-eval")
async def run_alert_eval(user: dict = Depends(premium_user)):
    created = await evaluate_grant_alerts(only_user=user["id"])
    return {"ok": True, "created": created}
