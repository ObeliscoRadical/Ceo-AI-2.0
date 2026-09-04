import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Megaphone,
  Store,
  Layers,
  BrainCircuit,
  Palette,
  Database,
  Share2,
  Calendar,
  Split,
  BarChart3,
  Bot,
  RefreshCw,
  Sparkles,
  Zap,
  Globe,
  Instagram,
  CheckCircle2
} from "lucide-react";

// Sub-components
import { VitrineSection } from "@/components/marketing/VitrineSection";
import { CampaignsWizardSection } from "@/components/marketing/CampaignsWizardSection";
import { MarketingCreatorSection } from "@/components/marketing/MarketingCreatorSection";
import { StudioSection } from "@/components/marketing/StudioSection";
import { ContentPoolSection } from "@/components/marketing/ContentPoolSection";
import { PostingPlanSection } from "@/components/marketing/PostingPlanSection";
import { InteractiveCalendarSection } from "@/components/marketing/InteractiveCalendarSection";
import { ExperimentsSection } from "@/components/marketing/ExperimentsSection";
import { AutopilotConsoleSection } from "@/components/marketing/AutopilotConsoleSection";
import { MetaConnectionSection } from "@/components/marketing/MetaConnectionSection";

const TABS = [
  { id: "dashboard", label: "Dashboard 360°", icon: Megaphone },
  { id: "vitrine", label: "Vitrine & Produtos", icon: Store },
  { id: "campanhas", label: "Campanhas (Wizard)", icon: Layers },
  { id: "criador", label: "Criador de Marketing", icon: BrainCircuit },
  { id: "studio", label: "Studio & Novo Post", icon: Palette },
  { id: "pool", label: "Content Pool", icon: Database },
  { id: "distribuicao", label: "Postagens & Frequência", icon: Share2 },
  { id: "calendario", label: "Calendário", icon: Calendar },
  { id: "experimentos", label: "Variações & A/B", icon: Split },
  { id: "analytics", label: "Analytics 360°", icon: BarChart3 },
  { id: "autopilot", label: "Growth & Autopilot", icon: Bot },
  { id: "conexoes", label: "Redes (Meta & TikTok)", icon: Share2 },
];

export default function Marketing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Global Marketing State
  const [products, setProducts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [poolData, setPoolData] = useState({});
  const [postingPlan, setPostingPlan] = useState({});
  const [calendarData, setCalendarData] = useState({});
  const [experiments, setExperiments] = useState([]);
  const [analyticsData, setAnalyticsData] = useState({});
  const [autopilotConfig, setAutopilotConfig] = useState({});
  const [autopilotLogs, setAutopilotLogs] = useState([]);
  const [socialStatus, setSocialStatus] = useState({});

  // Studio Preloaded Post
  const [studioInitialPost, setStudioInitialPost] = useState(null);

  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [
        prodsRes,
        campsRes,
        poolRes,
        planRes,
        calRes,
        expsRes,
        anRes,
        autoCfgRes,
        autoLogsRes,
        socialRes
      ] = await Promise.all([
        api.get("/marketing/products").catch(() => ({ data: { products: [] } })),
        api.get("/marketing/campaigns").catch(() => ({ data: { campaigns: [] } })),
        api.get("/marketing/pool").catch(() => ({ data: { items: [], counts: {}, runway: {} } })),
        api.get("/marketing/posting-plan").catch(() => ({ data: { posting_plan: {} } })),
        api.get("/marketing/calendar?view=semana").catch(() => ({ data: { slots: [] } })),
        api.get("/marketing/experiments").catch(() => ({ data: { experiments: [] } })),
        api.get("/marketing/analytics-full").catch(() => ({ data: { summary: {} } })),
        api.get("/marketing/autopilot/config").catch(() => ({ data: { config: {} } })),
        api.get("/marketing/autopilot/logs").catch(() => ({ data: { logs: [] } })),
        api.get("/social/status").catch(() => ({ data: {} })),
      ]);

      setProducts(prodsRes.data?.products || []);
      setCampaigns(campsRes.data?.campaigns || []);
      setPoolData(poolRes.data || {});
      setPostingPlan(planRes.data?.posting_plan || {});
      setCalendarData(calRes.data || {});
      setExperiments(expsRes.data?.experiments || []);
      setAnalyticsData(anRes.data || {});
      setAutopilotConfig(autoCfgRes.data?.config || {});
      setAutopilotLogs(autoLogsRes.data?.logs || []);
      setSocialStatus(socialRes.data || {});
    } catch (e) {
      console.error("Erro ao carregar dados de marketing:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (tabParam && TABS.some(t => t.id === tabParam)) {
      setActiveTab(tabParam);
    } else if (
      params.get("social_pending") ||
      params.get("social_error") ||
      params.get("connected") ||
      location.hash === "#marketing-agent-social"
    ) {
      setActiveTab("conexoes");
    }
  }, [location.search, location.hash]);

  // Handlers de Interconexão entre Módulos
  const handleSelectProductForCampaign = (product) => {
    setActiveTab("campanhas");
  };

  const handleOpenStudioWithCampaign = (campaign) => {
    setStudioInitialPost({
      campaign_id: campaign.id,
      product_id: campaign.product_id,
      title: `Peça · ${campaign.name}`,
      strategy: campaign.strategy || "Educativo",
      goal: campaign.objective || "leads"
    });
    setActiveTab("studio");
  };

  const handleOpenStudioWithProduct = (product) => {
    const prodImg = product.image_url || (product.images && product.images[0]) || null;
    setStudioInitialPost({
      product_id: product.id,
      title: `Destaque · ${product.name}`,
      strategy: "Conversão Direta",
      goal: "vendas",
      visual_briefing: product.visual_details || product.description || "",
      image_url: prodImg,
      image_variants: prodImg ? [prodImg] : [],
      caption: product.offer ? `${product.name}: ${product.offer}` : (product.description || ""),
      cta: product.cta || "Saber Mais"
    });
    setActiveTab("studio");
  };

  const handleSendIdeaToStudio = (idea, productId, campaignId, strategy, goal) => {
    const prodId = idea.product_id || (productId !== "none" ? productId : null);
    const campId = idea.campaign_id || (campaignId !== "none" ? campaignId : null);
    setStudioInitialPost({
      product_id: prodId,
      campaign_id: campId,
      title: idea.title,
      format: idea.format || "Post",
      strategy: idea.strategy || strategy || "Educativo",
      goal: idea.goal || goal || "leads",
      hook: idea.hook || "",
      caption: idea.caption || "",
      cta: idea.cta || "",
      hashtags: idea.hashtags || [],
      visual_briefing: idea.visual_briefing || "",
      image_url: idea.image_url || null,
      image_variants: idea.image_variants || [],
      carousel_slides: idea.carousel_slides || []
    });
    setActiveTab("studio");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400 font-medium">A carregar Esteira de Marketing Operacional COIA...</p>
      </div>
    );
  }

  const runway = poolData.runway || { available_stock: 0, daily_rate: 2, runway_days: 0, status: "healthy" };
  const summary = analyticsData.summary || {};

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header Principal COIA */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">COIA Marketing Operacional</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  IA Autopilot
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Vitrine → Campanhas → Criador → Studio → Content Pool → Scheduler → Calendário → A/B → Analytics → Autopilot
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadAllData(true)}
            disabled={refreshing}
            className="rounded-xl border-white/10 text-slate-300 hover:bg-white/5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar Dados
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveTab("studio")}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Criar Peça com IA
          </Button>
        </div>
      </div>

      {/* Barra de Navegação Unificada */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-white/5 scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo Dinâmico das Abas */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {/* 1. DASHBOARD 360° */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* KPIs de Alto Nível */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Content Runway</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">{runway.runway_days}</span>
                    <span className="text-xs text-slate-400">Dias de Estoque</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 mt-2 font-medium">
                    {runway.available_stock} peças prontas no pool
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Cadência Atual</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">{postingPlan.daily_posts || 4}</span>
                    <span className="text-xs text-slate-400">Posts / Dia</span>
                  </div>
                  <p className="text-[11px] text-blue-400 mt-2 font-medium">
                    Modo {postingPlan.mode || "UNIFORME"} ativo
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Campanhas Ativas</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">{campaigns.length}</span>
                    <span className="text-xs text-slate-400">Campanhas</span>
                  </div>
                  <p className="text-[11px] text-purple-400 mt-2 font-medium">
                    {products.length} produtos na Vitrine
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Autopilot</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-purple-400">{autopilotConfig.mode || "ASSISTIDO"}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 font-medium">
                    {autopilotLogs.length} ações registadas no log
                  </p>
                </div>
              </div>

              {/* Atalhos Rápidos da Esteira */}
              <div className="p-6 rounded-2xl border border-white/10 bg-gradient-to-r from-blue-900/10 via-purple-900/10 to-transparent">
                <h3 className="text-base font-bold text-white mb-2">Esteira de Marketing Integrada</h3>
                <p className="text-xs text-slate-400 mb-4 max-w-2xl">
                  Cada produto registado alimenta automaticamente o Criador de Campanhas, o Studio e o motor de agendamento anti-canibalização.
                </p>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <Button onClick={() => setActiveTab("vitrine")} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-xs text-slate-200">
                    <Store className="w-4 h-4 mr-2 text-blue-400" /> 1. Gerir Vitrine ({products.length})
                  </Button>
                  <Button onClick={() => setActiveTab("campanhas")} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-xs text-slate-200">
                    <Layers className="w-4 h-4 mr-2 text-purple-400" /> 2. Wizard de Campanhas
                  </Button>
                  <Button onClick={() => setActiveTab("studio")} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-xs text-slate-200">
                    <Palette className="w-4 h-4 mr-2 text-pink-400" /> 3. Criar no Studio
                  </Button>
                  <Button onClick={() => setActiveTab("calendario")} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-xs text-slate-200">
                    <Calendar className="w-4 h-4 mr-2 text-emerald-400" /> 4. Ver Calendário
                  </Button>
                </div>
              </div>

              {/* Feed do Autopilot e A/B Ativos */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Ações Recentes do Autopilot */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0B0F17] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-400" /> Ações do Autopilot
                    </h4>
                    <Button size="sm" variant="ghost" onClick={() => setActiveTab("autopilot")} className="text-xs text-purple-400 hover:text-purple-300">
                      Ver Todos
                    </Button>
                  </div>
                  {autopilotLogs.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">Nenhuma ação recente executada.</p>
                  ) : (
                    <div className="space-y-2">
                      {autopilotLogs.slice(0, 4).map((log) => (
                        <div key={log.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-white block">{log.title}</span>
                            <span className="text-slate-400">{log.reason}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/10 text-purple-300">
                            {log.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Experimentos A/B Ativos */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0B0F17] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Split className="w-4 h-4 text-purple-400" /> Testes A/B em Curso
                    </h4>
                    <Button size="sm" variant="ghost" onClick={() => setActiveTab("experimentos")} className="text-xs text-purple-400 hover:text-purple-300">
                      Ver Todos
                    </Button>
                  </div>
                  {experiments.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">Nenhum teste A/B em execução.</p>
                  ) : (
                    <div className="space-y-2">
                      {experiments.slice(0, 4).map((exp) => (
                        <div key={exp.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-white block">{exp.name}</span>
                            <span className="text-slate-400">Target: {exp.metric_target}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            exp.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-300"
                          }`}>
                            {exp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. VITRINE & PRODUTOS */}
          {activeTab === "vitrine" && (
            <VitrineSection
              products={products}
              onRefresh={() => loadAllData(true)}
              onSelectForCampaign={handleSelectProductForCampaign}
              onOpenStudioWithProduct={handleOpenStudioWithProduct}
              api={api}
            />
          )}

          {/* 3. CAMPANHAS (WIZARD 11-PASSOS) */}
          {activeTab === "campanhas" && (
            <CampaignsWizardSection
              campaigns={campaigns}
              products={products}
              onRefresh={() => loadAllData(true)}
              onOpenStudioWithCampaign={handleOpenStudioWithCampaign}
              api={api}
            />
          )}

          {/* 4. CRIADOR DE MARKETING */}
          {activeTab === "criador" && (
            <MarketingCreatorSection
              products={products}
              campaigns={campaigns}
              onSendIdeaToStudio={handleSendIdeaToStudio}
              onBatchApproveSuccess={() => {
                loadAllData(true);
                setActiveTab("pool");
              }}
              api={api}
            />
          )}

          {/* 5. STUDIO & NOVO POST */}
          {activeTab === "studio" && (
            <StudioSection
              products={products}
              campaigns={campaigns}
              initialPost={studioInitialPost}
              onSendToPoolSuccess={() => {
                loadAllData(true);
                setActiveTab("pool");
              }}
              api={api}
            />
          )}

          {/* 6. CONTENT POOL */}
          {activeTab === "pool" && (
            <ContentPoolSection
              poolData={poolData}
              products={products}
              campaigns={campaigns}
              onRefresh={() => loadAllData(true)}
              onOpenStudio={() => setActiveTab("studio")}
              api={api}
            />
          )}

          {/* 7. POSTAGENS & FREQUÊNCIA */}
          {activeTab === "distribuicao" && (
            <PostingPlanSection
              plan={postingPlan}
              onRefresh={() => loadAllData(true)}
              onGenerateSlots={() => loadAllData(true)}
              api={api}
            />
          )}

          {/* 8. CALENDÁRIO DRAG-AND-DROP */}
          {activeTab === "calendario" && (
            <InteractiveCalendarSection
              calendarData={calendarData}
              onRefresh={() => loadAllData(true)}
              api={api}
            />
          )}

          {/* 9. VARIAÇÕES & TESTES A/B */}
          {activeTab === "experimentos" && (
            <ExperimentsSection
              experiments={experiments}
              poolItems={poolData.items || []}
              onRefresh={() => loadAllData(true)}
              api={api}
            />
          )}

          {/* 10. ANALYTICS 360° */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">Analytics 360° Rastreáveis</h2>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Posts Publicados</span>
                  <span className="text-3xl font-black text-white mt-2 block">{summary.published_posts || 0}</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Reach Total</span>
                  <span className="text-3xl font-black text-white mt-2 block">{summary.total_reach || 0}</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Engagement Médio</span>
                  <span className="text-3xl font-black text-emerald-400 mt-2 block">{summary.avg_engagement_rate || 0}%</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Leads Estimados</span>
                  <span className="text-3xl font-black text-purple-400 mt-2 block">{summary.estimated_leads_generated || 0}</span>
                </div>
              </div>

              {/* Desempenho por Formato */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Melhores Formatos (Ranking)</h3>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {(analyticsData.best_formats || []).map((f, i) => (
                    <div key={i} className="p-4 rounded-xl border border-white/10 bg-[#0B0F17]">
                      <span className="text-xs font-bold text-purple-400">{f.format}</span>
                      <p className="text-xl font-bold text-white mt-1">{f.avg_engagement}% Eng.</p>
                      <p className="text-xs text-slate-400 mt-1">{f.clicks} Clicks · {f.reach} Reach</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desempenho por Produto */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Desempenho por Produto da Vitrine</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {(analyticsData.product_performance || []).map((p, i) => (
                    <div key={i} className="p-4 rounded-xl border border-white/10 bg-[#0B0F17]">
                      <span className="text-xs font-bold text-blue-400">{p.category}</span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{p.product_name}</h4>
                      <div className="mt-3 flex justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                        <span>Posts: <strong className="text-white">{p.published_posts}</strong></span>
                        <span>Leads: <strong className="text-emerald-400">{p.estimated_leads}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 11. AUTOPILOT */}
          {activeTab === "autopilot" && (
            <AutopilotConsoleSection
              configData={autopilotConfig}
              logs={autopilotLogs}
              onRefresh={() => loadAllData(true)}
              api={api}
            />
          )}

          {/* 12. CONEXÕES META & TIKTOK */}
          {activeTab === "conexoes" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-r from-blue-500/20 via-pink-500/20 to-purple-500/20 text-white border border-white/10">
                  <Share2 className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">Hub de Redes Sociais · Meta (Facebook & Instagram) & TikTok</h2>
              </div>
              <MetaConnectionSection api={api} onRefreshAll={() => loadAllData(true)} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
