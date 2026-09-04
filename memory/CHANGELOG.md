# CHANGELOG — CEO AI

## 2026-09-04 — Regra Obrigatória e Fixa: Resolução 1K para Geração de Imagens
- `backend/core.py`:
  - Enforçada resolução exclusivamente 1K (`image_size="1K"`) no Gemini 3.1 Flash Lite (`gemini-3.1-flash-lite-image`).
  - Proporções configuradas: 1:1 (1024x1024) padrão e 4:5 vertical para Instagram (928x1152 / aprox. 1024x1280).
  - Bloqueio estrito de resolução: 2K, 4K ou superior nunca são solicitadas, mesmo que o prompt mencione "4K", "ultra HD" ou "alta resolução".
  - Upscale automático após geração proibido: preserva fielmente os bytes nativos da API com o polish óptico.
  - Fallback secundário (Pollinations) também fixado em dimensões 1K (1024x1024 / 1024x1280).
- `backend/routers/marketing_pipeline.py` & `backend/routers/marketing.py`:
  - Removidas referências a 4K e encaminhado o formato 4:5 vertical para posts em formato vertical/story/Instagram.

## 2026-08-17 — 3 imagens por post com seleção visual
- `backend/core.py`
  - novo helper `generate_marketing_images(prompt, number_of_images)`
  - `generate_marketing_image()` passou a ser wrapper compatível de 1 imagem
- `backend/routers/marketing.py`
  - posts agora suportam `image_variants` + `selected_image_index`
  - retrocompatibilidade automática para posts antigos com `image_url` única
  - `POST /api/marketing/image` agora gera **3 imagens** por pedido
  - novo endpoint `POST /api/marketing/posts/{post_id}/image/select`
  - `image_url` fica sempre alinhada com a variante escolhida
- `frontend/src/components/marketing/PostImageVariantSelector.jsx`
  - novo seletor visual com:
    - imagem principal selecionada
    - badge da opção atual
    - 3 miniaturas
    - modal de preview ampliado
    - escolha da melhor imagem
    - botão `Gerar novas imagens`
- `frontend/src/pages/Marketing.jsx`
  - integração do novo fluxo no bloco de aprovação dos posts
  - texto de ajuda atualizado para o fluxo: gerar 3 → ampliar/escolher → aprovar
- testes:
  - `backend/tests/test_marketing_image_variants.py`
  - `testing_agent`: `/app/test_reports/iteration_52.json` PASS

## 2026-08-16 — Homepage gerida pelo Agente · Site + SEO técnico público
- `backend/routers/site_publishing.py`
  - novos slots seguros de homepage em `/login`:
    - headline
    - subtítulo
    - CTA principal + URL
    - CTA secundário + URL
    - prova social (título + 3 itens)
  - novo estado `homepage` em `GET /api/marketing/site-publishing/status`
  - novas rotas:
    - `POST /api/marketing/site-publishing/homepage/proposal`
    - `POST /api/marketing/site-publishing/homepage/apply`
  - `_get_settings()` passou a fazer merge com defaults para evitar docs parciais
- `frontend/src/components/marketing/SiteHomepageManagerSection.jsx`
  - novo gestor visual da homepage dentro do Gateway com preview Ao vivo vs Proposta do agente
- `frontend/src/components/marketing/SitePublishingGatewaySection.jsx`
  - integração do novo bloco da homepage
- `frontend/src/pages/Marketing.jsx`
  - handlers para gerar proposta e aplicar homepage
- `frontend/src/pages/Login.jsx`
  - homepage pública `/login` passou a consumir headline, subtítulo, CTAs e prova social via slots do gateway
  - CTAs funcionais e versão compacta em mobile
- `frontend/src/lib/seo.js`
  - canonical, robots, Open Graph e Twitter metadata reforçados para páginas públicas
- `frontend/public/index.html`
  - `lang="pt-PT"`
  - `robots noindex,nofollow` por defeito para a app privada
- `backend/routers/growth_agent.py`
  - sitemap.xml com `lastmod`
- testes / validação:
  - `backend/tests/test_site_homepage_management.py`
  - `testing_agent`: `/app/test_reports/iteration_51.json` PASS

## 2026-08-16 — Comparação inline reforçada no painel de Alterações do Site
- `frontend/src/components/marketing/SiteChangeHistorySection.jsx`
  - adicionado diff inline palavra-a-palavra com algoritmo LCS
  - novo bloco visual por alteração com:
    - contagem de `+ adições`
    - contagem de `- remoções`
    - texto removido com destaque/strikethrough no **Antes**
    - texto adicionado com destaque no **Depois**
  - mantém-se o diff clássico por campo, agora com uma camada visual mais forte
- validação final: `/app/test_reports/iteration_50.json` PASS

## 2026-08-16 — Painel visual de Alterações do Site
- `backend/routers/site_publishing.py`
  - adicionado `change_history` ao payload de `GET /api/marketing/site-publishing/status`
  - builder de histórico visual com:
    - summary
    - filtros por página / tipo / data
    - before_preview / after_preview
    - diff_items por campo
    - `rollback_version_id` para reverter exatamente para a versão anterior da alteração
- `frontend/src/components/marketing/SiteChangeHistorySection.jsx`
  - novo painel visual dentro de **Agente · Site > Gateway**
  - timeline de alterações, filtros, cards before/after, diff rico e botão de rollback
- `frontend/src/components/marketing/SitePublishingGatewaySection.jsx`
  - integração do novo painel dentro do Gateway
- `frontend/src/pages/Marketing.jsx`
  - rollback do gateway passou a aceitar `version_id` opcional
- testes:
  - `backend/tests/test_site_change_history.py`
  - validação end-to-end em `/app/test_reports/iteration_49.json`

## 2026-08-16 — Simplificação visual interna do Marketing
- `frontend/src/pages/Marketing.jsx`
  - página passou para uma leitura mais compacta e densa
  - adicionadas sequências visuais claras por agente (`OrderStrip`)
  - títulos principais encurtados
  - resumos mais curtos e orientados à função
- componentes de Marketing compactados visualmente:
  - `OrganicGrowthAgentSection.jsx`
  - `SitePublishingGatewaySection.jsx`
  - `GrowthAgentExecutiveSection.jsx`
  - `SocialMediaAgentSection.jsx`
  - `MetaConnectionSection.jsx`
  - `CampaignStudioSection.jsx`
  - `ExecutionQueueSection.jsx`
  - `AnalyticsSection.jsx`
  - `MarketingBriefingSection.jsx`
- ordem reforçada:
  - Site: Estratégia → Gateway → SEO/GA4/GSC
  - Redes Sociais: Automação → Meta → Marca & Conteúdo → Campanhas → Aprovação & Calendário → Operação & Resultados
- validação final: `/app/test_reports/iteration_48.json` PASS

## 2026-08-16 — Reorganização do módulo Marketing por agente
- `frontend/src/components/AppLayout.jsx`
  - submenu de Marketing simplificado para apenas 2 entradas:
    - `Agente · Site`
    - `Agente · Redes Sociais`
  - active state por hash passou a agrupar secções antigas sob Site ou Redes Sociais
- `frontend/src/pages/Marketing.jsx`
  - página reorganizada em 2 workspaces grandes:
    - `marketing-site-workspace`
    - `marketing-social-workspace`
  - **Agente · Site** passou a reunir as 3 frentes do Growth Agent
  - **Agente · Redes Sociais** passou a reunir as 6 frentes sociais
  - todas as secções antigas foram preservadas dentro do agente correto
  - adicionados links internos por área para navegação sem poluir a sidebar

## 2026-08-16 — Hardening do readiness de insights Meta
- `backend/routers/social.py`
  - parsing de scopes a partir de `granted_scopes` e `granular_scopes`
  - novos estados: `insights_status`, `insights_permissions_ready`, `report_source`
  - probe real de insights para distinguir permissões de dados reais
  - auto-refresh de diagnóstico para estados por validar
  - `/api/social/metrics/refresh` agora devolve razões mais claras
- `frontend/src/components/marketing/MetaConnectionSection.jsx`
  - badges e copy mais claros para:
    - analytics reais
    - permissões OK mas sem dados
    - mocked / token sem insights
- testes adicionados/atualizados:
  - `backend/tests/test_meta_metrics_readiness.py`
  - `backend/tests/test_meta_insights_api.py`

## 2026-08-16 — Meta metrics readiness fix
- inclusão dos scopes de insights no Social Media Agent
- endpoint `POST /api/social/metrics/refresh`
- UI a mostrar live vs mocked com mais honestidade

## 2026-08-16 — Meta credentials configuradas no preview
- `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_GRAPH_VERSION`
- backend reiniciado e validado

## 2026-08-14 — Separação definitiva Growth vs Social
- Growth Agent isolado do social publishing
- Social Media Agent isolado do site/SEO
- sidebar e página Marketing reorganizadas por responsabilidade

## 2026-08-13 — Growth Agent e gateway do site
- gateway interno de publicação do site
- overrides seguros de secções públicas
- growth analytics com GA4/GSC/internal tracking

## 2026-08-13 — Marketing analytics, fila e briefing
- workflow editorial com aprovação/agendamento/publicação
- analytics editoriais
- briefing diário
- fila visual de execução