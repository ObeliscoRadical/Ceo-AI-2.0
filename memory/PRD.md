# CEO AI — PRD Resumido

## Problema original
O utilizador pediu uma separação estrita do módulo de Marketing em dois agentes autónomos:

1. **Growth Agent** — responsável apenas por website, SEO, GA4, Google Search Console e conteúdo do site.
2. **Social Media Agent** — responsável apenas por calendário editorial, criativos, reels, agendamento, publicação e analytics sociais.

Também pediu a configuração real da integração Meta para deixar de depender de estados **MOCKED** quando houver permissões e dados reais disponíveis.

## Escolhas explícitas do utilizador
- Idioma preferido: **Português (pt-PT)**
- Prioridade atual neste fork: **métricas Meta em produção**
- Estado reportado pelo utilizador: **já testou em produção e ainda falha**
- Informação adicional confirmada pelo utilizador: já tem as permissões **`instagram_manage_insights`** e **`read_insights`** ativadas
- **REGRA FIXA E OBRIGATÓRIA DO SISTEMA — GERAÇÃO DE IMAGENS:**
  - Modelo exclusivo: **Gemini 3.1 Flash Lite / Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`) utilizando a chave paga `GEMINI_IMAGE_API_KEY`.
  - Resolução: **EXCLUSIVAMENTE 1K** (`image_size="1K"`).
  - Proibições estritas: Nunca solicitar 2K, 4K ou superior; nunca aumentar resolução com base no prompt do utilizador; manter 1K mesmo com menções a 4K ou alta resolução no texto; PROIBIDO fazer upscale automático após a geração.
  - Proporções: 1:1 quadrado padrão (1024x1024) ou 4:5 vertical para Instagram (~1024x1280 / 928x1152).
  - Prioridade: Minimizar custo da API mantendo máximo fotorrealismo e qualidade visual em 1K.
  - Regra permanente: Só pode ser alterada mediante instrução explícita do utilizador.

## Objetivos de produto
- Manter a separação total entre Growth Agent e Social Media Agent
- Permitir ligação Meta real para publicação e analytics
- Distinguir corretamente:
  - permissões/scopes disponíveis
  - readiness de publicação
  - readiness de insights reais
  - fallback para **MOCKED** apenas quando os dados reais ainda não estiverem confirmados

## Arquitetura atual
- **Frontend:** React SPA
- **Backend:** FastAPI
- **Base de dados:** MongoDB
- **Scheduler:** APScheduler

### Módulos principais
- `backend/routers/marketing_autonomous.py` → Growth Agent
- `backend/routers/social.py` → Social Media Agent, OAuth Meta, publicação e insights
- `backend/routers/marketing.py` → analytics editoriais, briefing, campanhas
- `frontend/src/pages/Marketing.jsx` → cockpit principal do Marketing
- `frontend/src/components/marketing/MetaConnectionSection.jsx` → estado de ligação Meta

## Estado funcional atual

### 0. Organização visual do módulo Marketing
Concluída neste fork.

- no menu lateral de **Marketing** existem agora apenas 2 entradas:
  - **Agente · Site**
  - **Agente · Redes Sociais**
- dentro de `/marketing`, a leitura também ficou separada em 2 blocos grandes:
  - **Agente · Site** → agrega as 3 frentes do Growth Agent
  - **Agente · Redes Sociais** → agrega as 6 frentes sociais
- nenhuma funcionalidade foi removida; apenas reorganizada por agente
- a ordem interna ficou simplificada e explícita:
  - **Agente · Site** → Estratégia → Gateway → SEO/GA4/GSC
  - **Agente · Redes Sociais** → Automação → Meta → Marca & Conteúdo → Campanhas → Aprovação & Calendário → Operação & Resultados
- títulos e resumos principais ficaram mais curtos
- os blocos internos ficaram mais compactos, com leitura mais densa e mais orientada a dashboard

### 0.1 Painel visual de Alterações do Site
Concluído neste fork.

- dentro de **Agente · Site > Gateway** existe agora um painel visual **Alterações do Site**
- o painel mostra:
  - timeline visual de alterações
  - cards com **before / after**
  - **diff visual rico** por campo
  - motivo da alteração
  - data/hora
  - tipo de alteração
  - botão de rollback quando existe versão anterior elegível
- filtros já incluídos na primeira versão:
  - por **página**
  - por **tipo**
  - por **data**
- a origem dos dados vem do histórico real do gateway (`site_publication_logs` + `site_content_versions`)
- o endpoint `GET /api/marketing/site-publishing/status` agora devolve `change_history`
- o diff visual foi reforçado com **comparação inline palavra-a-palavra**:
  - contagem de adições e remoções
  - texto removido destacado no bloco **Antes**
  - texto adicionado destacado no bloco **Depois**
  - convivência com o diff clássico por campo, sem perder a leitura executiva

### 0.2 Homepage gerida pelo Agente · Site
Concluído neste fork.

- dentro de **Agente · Site > Gateway** existe agora um bloco **Homepage gerida pelo agente**
- a primeira versão controlada pelo agente inclui:
  - **headline**
  - **subtítulo**
  - **CTA principal**
  - **CTA secundário**
  - **prova social**
- o gestor mostra:
  - preview **Ao vivo**
  - preview **Proposta do agente**
  - ação **Gerar proposta**
  - ação **Aplicar na homepage**
  - link para abrir a homepage pública
- a homepage pública desta fase é a rota **`/login`**
- os valores são publicados como `section_override` seguros no gateway

### 0.3 SEO técnico das páginas públicas
Concluído nesta fase inicial.

- `applyPublicSeo()` foi reforçado para aplicar:
  - **canonical**
  - **robots index/follow** nas páginas públicas
  - **Open Graph** (`og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`)
  - **Twitter Card** (`summary_large_image`)
- `frontend/public/index.html` ficou com **robots noindex/nofollow por defeito**
  - isto protege páginas privadas da app
  - as páginas públicas fazem override para index/follow
- `GET /api/public/sitemap.xml` agora inclui **`<lastmod>`**
- a consistência SEO foi validada em `/login` e no sitemap

### 0.4 Imagens sociais com 3 variações por post
Concluído neste fork.

- no bloco **Marketing > Agente · Redes Sociais > Conteúdos para aprovação**, cada pedido de imagem agora gera **3 variações de uma vez**
- o utilizador pode:
  - ver a imagem selecionada atual
  - ver as **3 miniaturas**
  - clicar para **ampliar preview**
  - escolher qual das 3 fica selecionada para o post
  - usar **Gerar novas imagens** para substituir as 3 atuais por 3 novas
- funciona em:
  - **posts novos**
  - **posts antigos** (retrocompatibilidade com `image_url` antiga)
- o post guarda agora:
  - `image_variants`
  - `selected_image_index`
  - `image_url` sempre alinhado com a variante escolhida

### 1. Separação de agentes
Concluída.

**Growth Agent**
- site público
- SEO técnico
- GA4
- GSC
- gateway interno de publicação do site

**Social Media Agent**
- calendário editorial
- posts/legendas/imagens
- agendamento
- publicação Meta
- analytics sociais

### 2. Meta OAuth e publicação
Concluído e já funcional no código.

- App ID / App Secret / Config ID reconhecidos
- ligação OAuth disponível
- seleção de página suportada
- publicação Facebook/Instagram separada do estado de insights

### 3. Meta insights readiness
Estado reforçado neste fork.

Foi implementado:
- parsing de permissões a partir de **`granted_scopes`** e também de **`granular_scopes`**
- distinção entre:
  - `insights_permissions_ready`
  - `live_metrics_ready`
  - `insights_status`
  - `report_source`
- probe real de insights com fallback coerente
- auto-refresh de diagnóstico quando o estado está por validar ou desatualizado
- resposta mais clara em `/api/social/metrics/refresh`

### 4. Estados Meta agora suportados
- `ready`
- `no_data`
- `permission_ready`
- `permission_denied`
- `expired`
- `unverified`
- `unavailable`

## Endpoints relevantes
- `GET /api/social/status`
- `POST /api/social/diagnostics`
- `POST /api/social/metrics/refresh`
- `GET /api/social/requirements`
- `GET /api/social/connect`
- `GET /api/social/callback`
- `POST /api/social/select-page`
- `POST /api/social/publish`
- `POST /api/social/schedule`
- `GET /api/marketing/analytics`
- `GET /api/marketing/site-publishing/status`
- `POST /api/marketing/site-publishing/homepage/proposal`
- `POST /api/marketing/site-publishing/homepage/apply`
- `GET /api/public/sitemap.xml`
- `POST /api/marketing/image`
- `POST /api/marketing/posts/{post_id}/image/select`

## Dados / coleções relevantes
- `social_connections`
- `social_posts`
- `social_jobs`
- `marketing_post_metrics`
- `marketing_organic_actions`

## Situação conhecida por ambiente

### Preview
Pode continuar a mostrar:
- `connection_state=degraded`
- `insights_status=unverified`
- `metrics_mocked=true`

Isto é aceitável quando a ligação guardada no preview não tem um token Meta válido com insights confirmados.

### Produção
As correções de código deste fork precisam de **redeploy** para chegarem à produção.

Mesmo com permissões ativadas na app Meta, o token/oauth em produção pode ainda precisar de:
- reconnect Meta
- nova validação do token
- confirmação de scopes realmente concedidos à sessão/token

## Ficheiros de referência
- `/app/backend/routers/social.py`
- `/app/backend/routers/marketing.py`
- `/app/backend/routers/site_publishing.py`
- `/app/backend/routers/growth_agent.py`
- `/app/frontend/src/pages/Marketing.jsx`
- `/app/frontend/src/pages/Login.jsx`
- `/app/frontend/src/lib/seo.js`
- `/app/frontend/public/index.html`
- `/app/frontend/src/components/marketing/MetaConnectionSection.jsx`
- `/app/frontend/src/components/marketing/SiteChangeHistorySection.jsx`
- `/app/frontend/src/components/marketing/SiteHomepageManagerSection.jsx`
- `/app/frontend/src/components/marketing/PostImageVariantSelector.jsx`
- `/app/backend/tests/test_meta_metrics_readiness.py`
- `/app/backend/tests/test_meta_insights_api.py`
- `/app/backend/tests/test_site_change_history.py`
- `/app/backend/tests/test_site_homepage_management.py`
- `/app/backend/tests/test_marketing_image_variants.py`

## Credenciais de teste
Ver `/app/memory/test_credentials.md`

## Última validação neste fork
- `pytest -n 0 backend/tests/test_meta_metrics_readiness.py backend/tests/test_meta_credentials.py backend/tests/test_meta_metrics_refresh.py` → **12 passed**
- `auto_frontend_testing_agent` → **PASS**
- `deep_testing_backend_v2` → **PASS**
- `testing_agent` → `/app/test_reports/iteration_46.json` **PASS**
- reorganização do Marketing validada em `/app/test_reports/iteration_47.json` → **PASS**
- simplificação visual compacta do Marketing validada em `/app/test_reports/iteration_48.json` → **PASS**
- painel visual de Alterações do Site validado em `/app/test_reports/iteration_49.json` → **PASS**
- comparação inline do diff visual validada em `/app/test_reports/iteration_50.json` → **PASS**
- homepage gerida + SEO técnico validados em `/app/test_reports/iteration_51.json` → **PASS**
- fluxo de 3 imagens por post validado em `/app/test_reports/iteration_52.json` → **PASS**

## Próximas prioridades
- **P0:** validar em produção após redeploy se o estado Meta deixa de ficar preso em mocked quando o token tiver insights reais
- **P1:** expandir a homepage gerida para mais blocos públicos (hero complementar, prova social rica, secções de valor, FAQ)
- **P1:** aprofundar SEO técnico (base URL canónica final do domínio, schema markup por página, cobertura mais ampla nas rotas públicas)
- **P1:** melhorar ainda mais a curadoria visual dos posts (ex.: favoritos, notas rápidas, score visual por variante)
- **P2:** geração automática de criativos
- **P2:** scoring de campanhas
- **P2:** UX da integração ERP