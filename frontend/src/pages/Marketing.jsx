import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExecutionQueueSection } from "@/components/marketing/ExecutionQueueSection";
import { AnalyticsSection } from "@/components/marketing/AnalyticsSection";
import { MarketingBriefingSection } from "@/components/marketing/MarketingBriefingSection";
import { MetaConnectionSection } from "@/components/marketing/MetaConnectionSection";
import { CampaignStudioSection } from "@/components/marketing/CampaignStudioSection";
import { OrganicGrowthAgentSection } from "@/components/marketing/OrganicGrowthAgentSection";
import { SitePublishingGatewaySection } from "@/components/marketing/SitePublishingGatewaySection";
import { GrowthAgentExecutiveSection } from "@/components/marketing/GrowthAgentExecutiveSection";
import { SocialMediaAgentSection } from "@/components/marketing/SocialMediaAgentSection";
import { PostImageVariantSelector } from "@/components/marketing/PostImageVariantSelector";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Megaphone,
  Sparkles,
  Copy,
  Download,
  RefreshCw,
  Calendar,
  Play,
  Hash,
  Instagram,
  Facebook,
  Send,
  Clock,
  Image as ImageIcon,
  Upload,
  Trash2,
  ShieldCheck,
  BadgeCheck,
  Library,
  Target,
  BrainCircuit,
} from "lucide-react";

const FORMAT_COLOR = { Post: "#3B82F6", Story: "#A78BFA", Reel: "#F59E0B" };
const STATUS_META = {
  draft: { label: "Rascunho", tone: "text-slate-200 bg-slate-500/15 border-slate-400/20" },
  approved: { label: "Aprovado", tone: "text-emerald-300 bg-emerald-500/15 border-emerald-400/20" },
  scheduled: { label: "Agendado", tone: "text-amber-300 bg-amber-500/15 border-amber-400/20" },
};

const SECTION_IDS = {
  siteAgent: "marketing-agent-site",
  socialAgentRoot: "marketing-agent-social",
  growthStrategy: "marketing-growth-site-strategy",
  growthPublishing: "marketing-growth-site-publishing",
  growthMonitor: "marketing-growth-seo-monitor",
  socialGetStarted: "marketing-social-get-started",
  socialAgent: "marketing-social-agent",
  socialConnection: "marketing-social-connection",
  socialBrandIdentity: "marketing-social-brand-identity",
  socialCampaigns: "marketing-social-campaigns",
  socialExecution: "marketing-social-execution",
  socialAnalytics: "marketing-social-analytics",
  socialBriefing: "marketing-social-briefing",
  socialApproval: "marketing-social-approval",
  socialCalendar: "marketing-social-calendar",
};

const SITE_AGENT_AREAS = [
  { id: SECTION_IDS.growthStrategy, label: "Estratégia do Site", testId: "marketing-site-area-strategy" },
  { id: SECTION_IDS.growthPublishing, label: "Gateway do Site", testId: "marketing-site-area-publishing" },
  { id: SECTION_IDS.growthMonitor, label: "SEO · GA4 · GSC", testId: "marketing-site-area-monitor" },
];

const SOCIAL_AGENT_AREAS = [
  { id: SECTION_IDS.socialAgent, label: "Automação", testId: "marketing-social-area-agent" },
  { id: SECTION_IDS.socialConnection, label: "Meta", testId: "marketing-social-area-meta" },
  { id: SECTION_IDS.socialBrandIdentity, label: "Marca & Conteúdo", testId: "marketing-social-area-brand" },
  { id: SECTION_IDS.socialCampaigns, label: "Campanhas", testId: "marketing-social-area-campaigns" },
  { id: SECTION_IDS.socialApproval, label: "Aprovação & Calendário", testId: "marketing-social-area-approval" },
  { id: SECTION_IDS.socialExecution, label: "Operação & Resultados", testId: "marketing-social-area-operations" },
];

const SOCIAL_AGENT_STARTER_AREAS = [
  { id: SECTION_IDS.socialAgent, label: "Automação", testId: "marketing-social-starter-agent" },
  { id: SECTION_IDS.socialConnection, label: "Meta", testId: "marketing-social-starter-meta" },
  { id: SECTION_IDS.socialGetStarted, label: "Gerar Conteúdos", testId: "marketing-social-starter-content" },
];

const captionOf = (post) => `${post.legenda || ""}\n\n${(post.hashtags || []).join(" ")}\n${post.cta || ""}`.trim();

const WorkflowBadge = ({ status, testId }) => {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
};

const PillList = ({ items = [], color = "#A78BFA", testIdPrefix }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item, index) => (
      <span
        key={`${item}-${index}`}
        data-testid={testIdPrefix ? `${testIdPrefix}-${index}` : undefined}
        className="text-xs px-3 py-1.5 rounded-full border"
        style={{ color, borderColor: `${color}50`, background: `${color}12` }}
      >
        {item}
      </span>
    ))}
  </div>
);

const TargetToggle = ({ channel, Icon, label, enabled, onToggle, testId }) => (
  <button
    type="button"
    data-testid={testId || `mkt-target-${channel}`}
    onClick={onToggle}
    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${enabled ? "border-[#A78BFA] text-[#A78BFA] bg-[#A78BFA]/10" : "border-white/15 text-muted-foreground"}`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

const AgentAreaLink = ({ id, label, testId, tone = "site" }) => {
  const theme = tone === "site"
    ? "border-[#3B82F6]/20 bg-[#3B82F6]/10 text-[#BFDBFE] hover:bg-[#3B82F6]/16"
    : "border-[#A78BFA]/20 bg-[#A78BFA]/10 text-[#E9D5FF] hover:bg-[#A78BFA]/16";

  return (
    <a
      href={`#${id}`}
      data-testid={testId}
      className={`rounded-full border px-3.5 py-2 text-xs font-medium tracking-[0.08em] transition-colors ${theme}`}
    >
      {label}
    </a>
  );
};

const OrderStrip = ({ items = [], tone = "site", testId }) => {
  const theme = tone === "site"
    ? "border-[#3B82F6]/16 bg-[#3B82F6]/10 text-[#BFDBFE]"
    : "border-[#A78BFA]/16 bg-[#A78BFA]/10 text-[#E9D5FF]";

  return (
    <div className="flex flex-wrap gap-2 mt-4" data-testid={testId}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className={`rounded-full border px-3 py-1.5 text-[11px] tracking-[0.08em] ${theme}`}>
          {index + 1}. {item}
        </span>
      ))}
    </div>
  );
};

const AgentWorkspace = ({ rootId, testId, tone = "site", eyebrow, title, description, countLabel, areas, children }) => {
  const theme = tone === "site"
    ? {
        shell: "border-[#3B82F6]/14 bg-[#07111E]/88 backdrop-blur-xl shadow-[0_18px_50px_rgba(2,6,23,0.28)]",
        eyebrow: "text-[#93C5FD]",
      }
    : {
        shell: "border-[#A78BFA]/14 bg-[#120D1F]/88 backdrop-blur-xl shadow-[0_18px_50px_rgba(2,6,23,0.28)]",
        eyebrow: "text-[#DDD6FE]",
      };

  return (
    <section id={rootId} className="scroll-mt-24 mb-10" data-testid={testId}>
      <div className={`rounded-[24px] border p-5 md:p-6 ${theme.shell}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="max-w-3xl space-y-2">
            <p className={`text-xs uppercase tracking-[0.22em] ${theme.eyebrow}`}>{eyebrow}</p>
            <h2 className="font-serif-lux text-[28px] leading-tight">{title}</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground" data-testid={`${testId}-count`}>
            {countLabel}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6" data-testid={`${testId}-areas`}>
          {areas.map((area) => (
            <AgentAreaLink key={area.id} id={area.id} label={area.label} testId={area.testId} tone={tone} />
          ))}
        </div>

        {children}
      </div>
    </section>
  );
};

function Marketing() {
  const location = useLocation();
  const [content, setContent] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [gen, setGen] = useState(false);
  const [social, setSocial] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [organicData, setOrganicData] = useState({ agent: null, actions: [], reports: { daily: [], weekly: [], monthly: [] } });
  const [siteGateway, setSiteGateway] = useState(null);
  const [growthAgent, setGrowthAgent] = useState(null);
  const [socialAgent, setSocialAgent] = useState(null);
  const [organicBusy, setOrganicBusy] = useState(false);
  const [siteGatewayBusy, setSiteGatewayBusy] = useState(null);
  const [growthBusy, setGrowthBusy] = useState(null);
  const [socialAgentBusy, setSocialAgentBusy] = useState(false);
  const [execution, setExecution] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [marketingEmailEnabled, setMarketingEmailEnabled] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [busy, setBusy] = useState(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [schedFor, setSchedFor] = useState(null);
  const [schedWhen, setSchedWhen] = useState("");
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [rescheduleWhen, setRescheduleWhen] = useState("");
  const [selectingPageId, setSelectingPageId] = useState(null);
  const [targets, setTargets] = useState({ instagram: true, facebook: true });
  const [logo, setLogo] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(null);
  const [workflowBusy, setWorkflowBusy] = useState(null);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingEmailBusy, setBriefingEmailBusy] = useState(false);

  const loadMarketing = async () => {
    try {
      const { data } = await api.get("/marketing/content");
      if (data.content?.content) {
        setContent(data.content.content);
        setUpdated(data.content.updated_at || null);
      } else {
        setContent(null);
        setUpdated(null);
      }
    } catch {
      setContent(null);
      setUpdated(null);
    } finally {
      setLoaded(true);
    }
  };

  const loadSocial = async () => {
    try {
      const { data } = await api.get("/social/status");
      setSocial(data);
    } catch {
      setSocial({ configured: false, connected: false, connection_state: "not_connected", checks: [], available_pages: [], missing_config: [] });
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data } = await api.get("/marketing/campaigns");
      setCampaigns(data.campaigns || []);
    } catch {
      setCampaigns([]);
    }
  };

  const loadOrganicAgent = async () => {
    try {
      const { data } = await api.get("/marketing/organic-agent");
      setOrganicData(data);
    } catch {
      setOrganicData({ agent: null, actions: [], reports: { daily: [], weekly: [], monthly: [] } });
    }
  };

  const loadSitePublishing = async () => {
    try {
      const { data } = await api.get("/marketing/site-publishing/status");
      setSiteGateway(data);
    } catch {
      setSiteGateway(null);
    }
  };

  const loadGrowthAgent = async () => {
    try {
      const { data } = await api.get("/marketing/growth-agent/status");
      setGrowthAgent(data);
    } catch {
      setGrowthAgent(null);
    }
  };

  const loadSocialMediaAgent = async () => {
    try {
      const { data } = await api.get("/social/media-agent");
      setSocialAgent(data);
    } catch {
      setSocialAgent(null);
    }
  };

  const refreshLiveSocialMetrics = async () => {
    try {
      await api.post("/social/metrics/refresh");
    } catch {
      // noop: fallback to mocked metrics when live insights are not ready yet
    }
  };

  const loadExecution = async () => {
    try {
      await refreshLiveSocialMetrics();
      const { data } = await api.get("/marketing/execution");
      setExecution(data);
    } catch {
      setExecution(null);
    }
  };

  const loadAnalytics = async () => {
    try {
      await refreshLiveSocialMetrics();
      const { data } = await api.get("/marketing/analytics");
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    }
  };

  const loadBriefing = async (force = false, sendEmail = false) => {
    try {
      const { data } = await api.post("/marketing/briefing/generate", { force, send_email: sendEmail });
      setBriefing(data);
      return data;
    } catch (error) {
      if (sendEmail) throw error;
      setBriefing(null);
      return null;
    }
  };

  const loadMarketingSettings = async () => {
    try {
      const { data } = await api.get("/settings");
      setMarketingEmailEnabled(!!data.email_marketing_briefing);
    } catch {
      setMarketingEmailEnabled(false);
    }
  };

  const loadLogo = async () => {
    try {
      const { data } = await api.get("/social/logo");
      setLogo(data.has_logo ? data.preview : null);
    } catch {
      setLogo(null);
    }
  };

  useEffect(() => {
    loadMarketing();
    loadSocial();
    loadExecution();
    loadAnalytics();
    loadCampaigns();
    loadOrganicAgent();
    loadSitePublishing();
    loadGrowthAgent();
    loadSocialMediaAgent();
    loadBriefing();
    loadMarketingSettings();
    loadLogo();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      toast.success("Redes ligadas com sucesso!");
      window.history.replaceState({}, "", "/marketing");
      loadSocial();
    }
    if (params.get("social_pending")) {
      toast("Ligação Meta autorizada. Agora escolha a Página certa para concluir.");
      window.history.replaceState({}, "", "/marketing");
      loadSocial();
    }
    if (params.get("social_error")) {
      toast.error(`Não foi possível ligar: ${params.get("social_error")}`);
      window.history.replaceState({}, "", "/marketing");
    }
  }, []);

  const sectionReadyKey = [
    loaded,
    !!content,
    campaigns.length,
    !!execution,
    !!analytics,
    !!briefing,
    !!organicData?.agent,
    !!siteGateway?.architecture,
    !!growthAgent?.policy,
    !!socialAgent?.boundary,
  ].join("-");

  useEffect(() => {
    if (!location.hash) return;
    const timer = window.setTimeout(() => {
      const id = location.hash.replace("#", "");
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.hash, sectionReadyKey]);

  const workflow = useMemo(() => {
    if (!content?.workflow_summary) return { draft: 0, approved: 0, scheduled: 0, total: 0 };
    return content.workflow_summary;
  }, [content]);

  const setWorkflowStatus = async (postId, status) => {
    setWorkflowBusy(postId);
    try {
      const { data } = await api.post(`/marketing/posts/${postId}/status`, { status });
      setContent(data.content);
      setUpdated(data.updated_at);
      await loadSocialMediaAgent();
      toast.success(status === "approved" ? "Conteúdo aprovado." : "Conteúdo voltou a rascunho.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setWorkflowBusy(null);
    }
  };

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post("/marketing/generate");
      setContent(data.content.content);
      setUpdated(data.content.updated_at);
      await loadExecution();
      await loadSocialMediaAgent();
      await loadBriefing(true, false);
      toast.success("Plano editorial gerado com contexto real do CRM, memórias e ERP.");
    } catch {
      toast.error("Não foi possível gerar agora.");
    } finally {
      setGen(false);
    }
  };

  const copyPost = (post) => {
    const txt = `${post.titulo}\n\n${post.legenda}\n\n${(post.hashtags || []).join(" ")}\n\n${post.cta || ""}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Conteúdo copiado!")).catch(() => {});
  };

  const exportAll = () => {
    if (!content) return;
    let text = "PLANO EDITORIAL — CEO AI 2.0 (Diretor de Marketing)\n\n";
    if (content.brand) {
      text += `Tom da marca: ${content.brand.tom}\n`;
      text += `Pilares: ${(content.brand.pilares || []).join(", ")}\n`;
      text += `Proposta de valor: ${content.brand.proposta_valor || ""}\n\n`;
    }
    text += "=== BIBLIOTECA DE CONTEÚDOS ===\n";
    (content.biblioteca || []).forEach((item, index) => {
      text += `${index + 1}. ${item.titulo}\nÂngulo: ${item.angulo}\nObjetivo: ${item.objetivo}\nCTA: ${item.cta}\n\n`;
    });
    text += "=== POSTS ===\n\n";
    (content.posts || []).forEach((post, index) => {
      text += `${index + 1}. [${post.formato}] ${post.titulo} (${post.dia || ""})\n`;
      text += `Estado: ${post.status || "draft"}\n`;
      text += `Tema: ${post.tema || ""}\n${post.legenda}\n`;
      text += `${(post.hashtags || []).join(" ")}\nCTA: ${post.cta || ""}\n\n`;
    });
    text += "=== CALENDÁRIO 30 DIAS ===\n";
    (content.calendario || []).forEach((item) => {
      text += `${item.data || ""} · ${item.dia}: [${item.formato}] ${item.tema} · ${item.objetivo || ""}\n`;
    });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plano-marketing-ceo-ai.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ficheiro exportado.");
  };

  const connect = async () => {
    try {
      const { data } = await api.get("/social/connect");
      window.location.href = data.auth_url;
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const disconnect = async () => {
    await api.post("/social/disconnect");
    toast.success("Redes desligadas.");
    loadSocial();
    loadSocialMediaAgent();
  };

  const runSocialDiagnostics = async () => {
    setDiagnosticsBusy(true);
    try {
      const { data } = await api.post("/social/diagnostics");
      setSocial(data);
      await loadSocialMediaAgent();
      toast.success(data.connected ? "Ligação Meta validada." : "Checklist Meta atualizada.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const selectMetaPage = async (pageId) => {
    setSelectingPageId(pageId);
    try {
      const { data } = await api.post("/social/select-page", { page_id: pageId });
      setSocial(data.connection);
      await loadSocialMediaAgent();
      toast.success("Página Meta escolhida e ligação concluída.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSelectingPageId(null);
    }
  };

  const runSocialMediaAgent = async () => {
    setSocialAgentBusy(true);
    try {
      const { data } = await api.post("/social/media-agent/run");
      setSocialAgent(data);
      await loadExecution();
      await loadMarketing();
      await loadAnalytics();
      await loadBriefing(true, false);
      toast.success("Social Media Agent executado.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSocialAgentBusy(false);
    }
  };

  const generateCampaign = async (payload) => {
    setCampaignBusy(true);
    try {
      const { data } = await api.post("/marketing/campaigns/generate", payload);
      setCampaigns((current) => [data.campaign, ...(current || [])].slice(0, 20));
      toast.success("Campanha multicanal criada.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setCampaignBusy(false);
    }
  };

  const createOrganicStrategy = async (payload) => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/strategy", payload);
      setOrganicData(data);
      toast.success("Estratégia do Growth Agent gerada.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const approveOrganicStrategy = async () => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/approve");
      setOrganicData(data);
      await loadExecution();
      await loadAnalytics();
      await loadSitePublishing();
      await loadGrowthAgent();
      toast.success("Estratégia aprovada. O agente entrou em modo autônomo.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const pauseOrganicAgent = async () => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/pause");
      setOrganicData(data);
      toast.success("Agente pausado.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const resumeOrganicAgent = async () => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/resume");
      setOrganicData(data);
      await loadExecution();
      await loadAnalytics();
      await loadSitePublishing();
      await loadGrowthAgent();
      toast.success("Agente retomado.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const reanalyzeOrganicAgent = async () => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/reanalyze");
      setOrganicData(data);
      await loadExecution();
      await loadAnalytics();
      await loadSitePublishing();
      await loadGrowthAgent();
      toast.success("Site reanalisado e estratégia atualizada.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const updateOrganicObjective = async (objective) => {
    setOrganicBusy(true);
    try {
      const { data } = await api.post("/marketing/organic-agent/objective", { objective });
      setOrganicData(data);
      await loadExecution();
      await loadAnalytics();
      await loadSitePublishing();
      await loadGrowthAgent();
      toast.success("Objetivo do agente atualizado.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setOrganicBusy(false);
    }
  };

  const toggleTargetChannel = (channel) => {
    setTargets((current) => ({ ...current, [channel]: !current[channel] }));
  };

  const publishNow = async (post, index) => {
    if (!social?.connected) {
      toast.error("Ligue primeiro as suas redes.");
      return;
    }
    if (post.status !== "approved") {
      toast.error("Aprove primeiro este conteúdo antes de publicar.");
      return;
    }
    setBusy(index);
    try {
      const { data } = await api.post("/social/publish", {
        caption: captionOf(post),
        image_url: post.image_url || null,
        image_prompt: `${post.titulo}. ${content?.brand?.tom || ""}`,
        generate_image: !post.image_url,
        post_id: post.id,
        instagram: targets.instagram,
        facebook: targets.facebook,
      });
      const errors = Object.entries(data.results || {})
        .filter(([, value]) => value?.error)
        .map(([channel, value]) => `${channel}: ${value.error}`);
      if (errors.length) toast.warning(`Publicado com avisos — ${errors.join(" · ")}`);
      else toast.success("Publicado nas suas redes! 🎉");
      await loadMarketing();
      await loadExecution();
      await loadAnalytics();
      await loadSocialMediaAgent();
      await loadBriefing(true, false);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(`Falha ao publicar: ${detail?.meta_error ? JSON.stringify(detail.meta_error).slice(0, 180) : formatApiError(detail)}`);
    } finally {
      setBusy(null);
    }
  };

  const openSchedule = (post) => {
    if (post.status !== "approved") {
      toast.error("Aprove primeiro este conteúdo antes de o agendar.");
      return;
    }
    setSchedFor(post);
    const dt = new Date(Date.now() + 60 * 60 * 1000);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    setSchedWhen(dt.toISOString().slice(0, 16));
  };

  const confirmSchedule = async () => {
    if (!schedWhen || !schedFor) return;
    try {
      await api.post("/social/schedule", {
        caption: captionOf(schedFor),
        image_url: schedFor.image_url || null,
        image_prompt: `${schedFor.titulo}. ${content?.brand?.tom || ""}`,
        generate_image: !schedFor.image_url,
        post_id: schedFor.id,
        instagram: targets.instagram,
        facebook: targets.facebook,
        run_at: new Date(schedWhen).toISOString(),
      });
      toast.success("Publicação agendada!");
      setSchedFor(null);
      await loadMarketing();
      await loadExecution();
      await loadSocialMediaAgent();
      await loadBriefing(true, false);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const cancelJob = async (id) => {
    try {
      await api.delete(`/social/jobs/${id}`);
      toast.success("Agendamento cancelado.");
      await loadExecution();
      await loadMarketing();
      await loadSocialMediaAgent();
      await loadBriefing(true, false);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const openReschedule = (job) => {
    setRescheduleFor(job);
    const dt = new Date(job.run_at || Date.now() + 60 * 60 * 1000);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    setRescheduleWhen(dt.toISOString().slice(0, 16));
  };

  const confirmReschedule = async () => {
    if (!rescheduleFor || !rescheduleWhen) return;
    try {
      await api.post(`/social/jobs/${rescheduleFor.id}/reschedule`, { run_at: new Date(rescheduleWhen).toISOString() });
      toast.success("Agendamento atualizado.");
      setRescheduleFor(null);
      await loadExecution();
      await loadMarketing();
      await loadSocialMediaAgent();
      await loadBriefing(true, false);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const toggleMarketingEmail = async (enabled) => {
    setMarketingEmailEnabled(enabled);
    try {
      await api.put("/settings", { email_marketing_briefing: enabled });
      toast.success(enabled ? "Briefing de marketing por email ativado." : "Briefing de marketing por email desativado.");
    } catch (error) {
      setMarketingEmailEnabled((current) => !current);
      toast.error(formatApiError(error.response?.data?.detail));
    }
  };

  const refreshBriefing = async () => {
    setBriefingBusy(true);
    try {
      await loadBriefing(true, false);
      toast.success("Briefing de marketing atualizado.");
    } catch {
      toast.error("Não foi possível atualizar o briefing agora.");
    } finally {
      setBriefingBusy(false);
    }
  };

  const sendBriefingEmail = async () => {
    setBriefingEmailBusy(true);
    try {
      await loadBriefing(true, true);
      toast.success("Briefing de marketing enviado por email.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setBriefingEmailBusy(false);
    }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/social/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLogo(data.preview);
      toast.success("Logo carregado! Será aplicado nas imagens geradas.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setLogoBusy(false);
      event.target.value = "";
    }
  };

  const removeLogo = async () => {
    await api.delete("/social/logo");
    setLogo(null);
    toast.success("Logo removido.");
  };

  const genImage = async (index) => {
    setImgBusy(`generate-${index}`);
    try {
      const { data } = await api.post("/marketing/image", { index });
      setContent((current) => {
        const posts = [...(current?.posts || [])];
        posts[index] = {
          ...posts[index],
          image_url: data.image_url,
          image_variants: data.image_variants || [],
          selected_image_index: data.selected_image_index,
        };
        return { ...current, posts };
      });
      toast.success("3 imagens criadas com o seu logo.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setImgBusy(null);
    }
  };

  const selectImageVariant = async (postId, variantIndex) => {
    setImgBusy(`select-${postId}-${variantIndex}`);
    try {
      const { data } = await api.post(`/marketing/posts/${postId}/image/select`, { variant_index: variantIndex });
      setContent((current) => {
        const posts = [...(current?.posts || [])];
        const index = posts.findIndex((item) => item.id === postId);
        if (index >= 0) {
          posts[index] = {
            ...posts[index],
            image_url: data.image_url,
            image_variants: data.image_variants || posts[index].image_variants || [],
            selected_image_index: data.selected_image_index,
          };
        }
        return { ...current, posts };
      });
      toast.success(`Imagem ${variantIndex + 1} selecionada para este post.`);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setImgBusy(null);
    }
  };

  const authorizeSitePublishing = async () => {
    setSiteGatewayBusy("authorize");
    try {
      const { data } = await api.post("/marketing/site-publishing/authorize", {
        auto_publish_after_strategy_approval: true,
        auto_generate_hero_images: true,
        allow_section_overrides: true,
        allow_delete: true,
      });
      setSiteGateway(data);
      await loadOrganicAgent();
      await loadGrowthAgent();
      toast.success("Gateway autorizado. O agente já pode escrever no site público dentro do escopo seguro.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSiteGatewayBusy(null);
    }
  };

  const runSitePublishingNow = async () => {
    setSiteGatewayBusy("run");
    try {
      const { data } = await api.post("/marketing/site-publishing/run", { force: true, use_ai: false });
      setSiteGateway(data.status);
      await loadOrganicAgent();
      await loadGrowthAgent();
      toast.success(data.published_entry ? "Conteúdo público publicado pelo gateway." : "Sem nova publicação necessária neste momento.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSiteGatewayBusy(null);
    }
  };


  const rollbackSiteEntry = async (entryId, versionId = null) => {
    setSiteGatewayBusy(`rollback-${entryId}`);
    try {
      const { data } = await api.post(`/marketing/site-publishing/content/${entryId}/rollback`, { version_id: versionId });
      setSiteGateway(data.status);
      await loadGrowthAgent();
      toast.success("Rollback concluído.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSiteGatewayBusy(null);
    }
  };

  const removeSiteEntry = async (entryId) => {
    setSiteGatewayBusy(`remove-${entryId}`);
    try {
      const { data } = await api.post(`/marketing/site-publishing/content/${entryId}/remove`);
      setSiteGateway(data.status);
      await loadGrowthAgent();
      toast.success("Conteúdo removido do site público.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSiteGatewayBusy(null);
    }
  };

  const syncGrowthAgent = async () => {
    setGrowthBusy("sync");
    try {
      const { data } = await api.post("/marketing/growth-agent/sync");
      setGrowthAgent(data.status);
      toast.success("Sincronização Growth concluída.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setGrowthBusy(null);
    }
  };

  const runGrowthAgent = async () => {
    setGrowthBusy("run");
    try {
      const { data } = await api.post("/marketing/growth-agent/run", { force: true, use_ai: false });
      setGrowthAgent(data);
      await loadSitePublishing();
      toast.success("Ciclo Growth executado.");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setGrowthBusy(null);
    }
  };

  const downloadImage = async (url, index) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const linkUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = linkUrl;
      a.download = `marketing-post-${index + 1}.png`;
      a.click();
      URL.revokeObjectURL(linkUrl);
      toast.success("Imagem guardada no seu dispositivo!");
    } catch {
      toast.error("Não foi possível guardar a imagem.");
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-40" data-testid="marketing-loading-state">
        <Loader2 className="w-6 h-6 animate-spin text-[#A78BFA]" />
      </div>
    );
  }

  const brandBrain = content?.brand_brain || {};
  const socialAgentAreas = content ? SOCIAL_AGENT_AREAS : SOCIAL_AGENT_STARTER_AREAS;

  return (
    <div className="px-6 md:px-12 py-12 md:py-14 max-w-[1240px] mx-auto" data-testid="marketing-page">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">Conselho Executivo · Marketing</p>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div className="space-y-2 max-w-3xl">
          <h1 className="font-serif-lux text-4xl md:text-5xl text-[#A78BFA] flex items-center gap-3 leading-tight" data-testid="marketing-page-title">
            <Megaphone className="w-8 h-8" />
            Marketing organizado por agente
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl" data-testid="marketing-page-subtitle">
            Duas frentes claras, sem mistura: <strong>Agente · Site</strong> para Growth, site e SEO; <strong>Agente · Redes Sociais</strong> para Facebook, Instagram, conteúdos, calendário e resultados.
          </p>
          {updated && <p className="text-xs text-muted-foreground" data-testid="mkt-updated-at">Atualizado em {new Date(updated).toLocaleString("pt-PT")}</p>}
        </div>
        {content && (
          <div className="flex gap-2 flex-wrap">
            <Button data-testid="mkt-export-btn" onClick={exportAll} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
              <Download className="w-4 h-4 mr-2" />
              Exportar tudo
            </Button>
            <Button data-testid="mkt-regen-btn" onClick={generate} disabled={gen} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
              {gen ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Gerar novamente
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-8" data-testid="marketing-agent-boundary-grid">
        <a href={`#${SECTION_IDS.siteAgent}`} className="surface rounded-[22px] p-5 transition-colors hover:bg-white/[0.04]" data-testid="marketing-growth-boundary-card">
          <p className="text-xs uppercase tracking-[0.2em] text-[#3B82F6]">Agente · Site</p>
          <h2 className="font-serif-lux text-[26px] mt-2 leading-tight">Estratégia, publicação e monitorização</h2>
          <p className="text-sm text-muted-foreground mt-2">As 3 frentes do Growth ficam juntas num único espaço do site.</p>
          <OrderStrip items={["Estratégia", "Gateway", "SEO/GA4/GSC"]} tone="site" testId="marketing-site-order-strip" />
        </a>
        <a href={`#${SECTION_IDS.socialAgentRoot}`} className="surface rounded-[22px] p-5 transition-colors hover:bg-white/[0.04]" data-testid="marketing-social-boundary-card">
          <p className="text-xs uppercase tracking-[0.2em] text-[#A78BFA]">Agente · Redes Sociais</p>
          <h2 className="font-serif-lux text-[26px] mt-2 leading-tight">Operação social do conteúdo ao resultado</h2>
          <p className="text-sm text-muted-foreground mt-2">As 6 frentes sociais ficam agrupadas num fluxo único e claro.</p>
          <OrderStrip items={["Automação", "Meta", "Marca & Conteúdo", "Campanhas", "Aprovação & Calendário", "Operação & Resultados"]} tone="social" testId="marketing-social-order-strip" />
        </a>
      </div>

      <AgentWorkspace
        rootId={SECTION_IDS.siteAgent}
        testId="marketing-site-workspace"
        tone="site"
        eyebrow="Agente · Site"
        title="Agente do site"
        description="Tudo o que é Growth do site, em ordem clara: estratégia, gateway e SEO/GA4/GSC."
        countLabel="3 frentes do site"
        areas={SITE_AGENT_AREAS}
      >
        <section id={SECTION_IDS.growthStrategy} className="scroll-mt-24" data-testid="marketing-section-growth-strategy">
          <OrganicGrowthAgentSection
            data={organicData}
            busy={organicBusy}
            onCreateStrategy={createOrganicStrategy}
            onApprove={approveOrganicStrategy}
            onPause={pauseOrganicAgent}
            onResume={resumeOrganicAgent}
            onReanalyze={reanalyzeOrganicAgent}
            onUpdateObjective={updateOrganicObjective}
          />
        </section>

        <section id={SECTION_IDS.growthPublishing} className="scroll-mt-24" data-testid="marketing-section-growth-publishing">
          <SitePublishingGatewaySection
            data={siteGateway}
            busy={siteGatewayBusy}
            onAuthorize={authorizeSitePublishing}
            onRunNow={runSitePublishingNow}
            onRollback={rollbackSiteEntry}
            onRemove={removeSiteEntry}
            onRefresh={loadSitePublishing}
          />
        </section>

        <section id={SECTION_IDS.growthMonitor} className="scroll-mt-24" data-testid="marketing-section-growth-monitor">
          <GrowthAgentExecutiveSection
            data={growthAgent}
            busy={growthBusy}
            onSync={syncGrowthAgent}
            onRun={runGrowthAgent}
          />
        </section>
      </AgentWorkspace>

      <AgentWorkspace
        rootId={SECTION_IDS.socialAgentRoot}
        testId="marketing-social-workspace"
        tone="social"
        eyebrow="Agente · Redes Sociais"
        title="Agente de redes sociais"
        description="Toda a operação social em sequência: automação, Meta, conteúdo, campanhas, aprovação e resultados."
        countLabel={content ? "6 frentes sociais" : "social pronto a ativar"}
        areas={socialAgentAreas}
      >
      <section id={SECTION_IDS.socialAgent} className="scroll-mt-24" data-testid="marketing-section-social-agent">
        <SocialMediaAgentSection data={socialAgent} busy={socialAgentBusy} onRun={runSocialMediaAgent} onRefresh={loadSocialMediaAgent} />
      </section>

      <section id={SECTION_IDS.socialConnection} className="scroll-mt-24" data-testid="marketing-section-social-connection">
        <MetaConnectionSection
          social={social}
          targets={targets}
          onToggleTarget={toggleTargetChannel}
          onConnect={connect}
          onDisconnect={disconnect}
          onRunDiagnostics={runSocialDiagnostics}
          onSelectPage={selectMetaPage}
          diagnosticsBusy={diagnosticsBusy}
          selectingPageId={selectingPageId}
        />

          <div className="surface rounded-[22px] p-5 md:p-6 mb-6" data-testid="mkt-logo-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center overflow-hidden shrink-0">
                {logo ? <img src={logo} alt="Logo" className="w-full h-full object-contain p-1.5" data-testid="mkt-logo-preview" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div>
                  <h2 className="font-serif-lux text-lg" data-testid="mkt-logo-title">Logo social</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md" data-testid="mkt-logo-description">
                  {logo ? "O logo entra automaticamente nas imagens geradas." : "Carregue o logo para aparecer nas imagens e publicações sociais."}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <label data-testid="mkt-logo-upload" className="cursor-pointer inline-flex items-center gap-2 text-sm px-4 h-10 rounded-full border border-white/15 hover:bg-white/5 transition-colors">
                {logoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {logo ? "Alterar" : "Carregar logo"}
                <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} disabled={logoBusy} />
              </label>
              {logo && (
                <Button data-testid="mkt-logo-remove" onClick={removeLogo} variant="outline" className="rounded-full border-white/15 hover:bg-white/5 h-10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {!content ? (
        <section id={SECTION_IDS.socialGetStarted} className="scroll-mt-24" data-testid="marketing-section-social-get-started">
          <div className="surface rounded-[22px] p-6 md:p-7" data-testid="mkt-intro">
            <div className="w-12 h-12 rounded-2xl bg-[#A78BFA]/18 flex items-center justify-center mb-4">
              <Megaphone className="w-7 h-7 text-[#A78BFA]" />
            </div>
            <h2 className="font-serif-lux text-[24px] mb-2" data-testid="mkt-intro-title">Arrancar o agente social</h2>
            <p className="text-sm text-muted-foreground max-w-2xl mb-6" data-testid="mkt-intro-description">
              O agente cruza identidade, CRM, memórias e contexto do negócio para gerar campanhas, posts e um calendário pronto a aprovar.
            </p>
            <Button data-testid="mkt-generate-btn" onClick={generate} disabled={gen} className="rounded-full bg-[#A78BFA] text-white hover:bg-[#9333EA] px-6 h-11 text-sm">
              {gen ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> A criar conteúdos…</> : <><Play className="w-5 h-5 mr-2" /> Gerar conteúdos</>}
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-3 mb-6" data-testid="mkt-workflow-summary">
            {[
              { key: "draft", label: "Rascunhos", value: workflow.draft, icon: ShieldCheck },
              { key: "approved", label: "Aprovados", value: workflow.approved, icon: BadgeCheck },
              { key: "scheduled", label: "Agendados", value: workflow.scheduled, icon: Clock },
            ].map(({ key, label, value, icon: Icon }) => (
              <div key={key} className="surface rounded-[20px] p-4" data-testid={`mkt-workflow-${key}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold mt-2" data-testid={`mkt-workflow-${key}-value`}>{value || 0}</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#A78BFA]" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {content.brand && (
            <section id={SECTION_IDS.socialBrandIdentity} className="scroll-mt-24" data-testid="marketing-section-social-brand-identity">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4 mb-6">
              <div className="surface rounded-[22px] p-5 md:p-6" data-testid="mkt-brand">
                <h2 className="font-serif-lux text-lg mb-2 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#A78BFA]" /> Marca</h2>
                <p className="text-muted-foreground mb-4" data-testid="mkt-brand-tone">{content.brand.tom}</p>
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Pilares</p>
                    <PillList items={content.brand.pilares || []} testIdPrefix="mkt-brand-pillar" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Proposta de valor</p>
                    <p className="text-sm text-foreground" data-testid="mkt-brand-value-proposition">{content.brand.proposta_valor}</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div data-testid="mkt-brand-audiences">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Audiências</p>
                      <PillList items={content.brand.audiencias || []} color="#3B82F6" testIdPrefix="mkt-brand-audience" />
                    </div>
                    <div data-testid="mkt-brand-proof">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Provas</p>
                      <PillList items={content.brand.provas || []} color="#10B981" testIdPrefix="mkt-brand-proof-item" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="surface rounded-[22px] p-5 md:p-6" data-testid="mkt-brand-brain">
                <h2 className="font-serif-lux text-lg mb-2 flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-[#3B82F6]" /> Brand Brain</h2>
                <p className="text-sm text-muted-foreground mb-5" data-testid="mkt-brand-brain-positioning">{brandBrain.positioning || "Sem posicionamento disponível."}</p>
                <div className="grid grid-cols-2 gap-3 mb-5" data-testid="mkt-brand-brain-sources">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs text-muted-foreground">Memórias usadas</p>
                    <p className="text-xl font-semibold" data-testid="mkt-brand-brain-memories">{brandBrain.context_sources?.memories || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs text-muted-foreground">Leads no radar</p>
                    <p className="text-xl font-semibold" data-testid="mkt-brand-brain-leads">{brandBrain.context_sources?.crm_leads || 0}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div data-testid="mkt-brand-brain-priorities">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Prioridades editoriais</p>
                    <ul className="space-y-2 text-sm text-foreground">
                      {(brandBrain.prioridades || []).map((item, index) => <li key={index} data-testid={`mkt-brand-brain-priority-${index}`}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div data-testid="mkt-brand-brain-do-say">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Dizer sempre</p>
                      <PillList items={content.brand.do_say || []} color="#10B981" testIdPrefix="mkt-brand-dosay" />
                    </div>
                    <div data-testid="mkt-brand-brain-avoid">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Evitar</p>
                      <PillList items={content.brand.avoid || []} color="#F59E0B" testIdPrefix="mkt-brand-avoid" />
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </section>
          )}

          {content.biblioteca?.length > 0 && (
            <div className="surface rounded-[22px] p-5 md:p-6 mb-6" data-testid="mkt-library">
              <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
                <div>
                  <h2 className="font-serif-lux text-lg flex items-center gap-2"><Library className="w-5 h-5 text-[#3B82F6]" /> Biblioteca</h2>
                  <p className="text-sm text-muted-foreground mt-2" data-testid="mkt-library-description">Ângulos reutilizáveis para manter consistência editorial.</p>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="mkt-library-count">{content.biblioteca.length} ângulos ativos</div>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {content.biblioteca.map((item, index) => (
                  <div key={item.id || index} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4" data-testid={`mkt-library-${index}`}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="font-medium text-base" data-testid={`mkt-library-title-${index}`}>{item.titulo}</p>
                      <Target className="w-4 h-4 text-[#A78BFA] shrink-0" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4" data-testid={`mkt-library-angle-${index}`}>{item.angulo}</p>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p data-testid={`mkt-library-objective-${index}`}><span className="text-foreground">Objetivo:</span> {item.objetivo}</p>
                      <p data-testid={`mkt-library-pillar-${index}`}><span className="text-foreground">Pilar:</span> {item.pilar}</p>
                      <p data-testid={`mkt-library-formats-${index}`}><span className="text-foreground">Formatos:</span> {(item.formatos || []).join(", ")}</p>
                      <p data-testid={`mkt-library-cta-${index}`}><span className="text-foreground">CTA:</span> {item.cta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <section id={SECTION_IDS.socialCampaigns} className="scroll-mt-24" data-testid="marketing-section-social-campaign-studio">
            <CampaignStudioSection campaigns={campaigns} generating={campaignBusy} onGenerate={generateCampaign} />
          </section>

          <section id={SECTION_IDS.socialExecution} className="scroll-mt-24" data-testid="marketing-section-social-execution-queue">
            <ExecutionQueueSection execution={execution} onCancelJob={cancelJob} onRescheduleOpen={openReschedule} />
          </section>

          <section id={SECTION_IDS.socialAnalytics} className="scroll-mt-24" data-testid="marketing-section-social-analytics">
            <AnalyticsSection analytics={analytics} />
          </section>

          <section id={SECTION_IDS.socialBriefing} className="scroll-mt-24" data-testid="marketing-section-social-daily-briefing">
            <MarketingBriefingSection
              briefing={briefing}
              briefingBusy={briefingBusy}
              emailSending={briefingEmailBusy}
              autoEmailEnabled={marketingEmailEnabled}
              onToggleAutoEmail={toggleMarketingEmail}
              onRefresh={refreshBriefing}
              onSendEmail={sendBriefingEmail}
            />
          </section>

          <section id={SECTION_IDS.socialApproval} className="scroll-mt-24" data-testid="marketing-section-social-approval-content">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
            <div>
              <h2 className="font-serif-lux text-[24px]" data-testid="mkt-posts-title">Conteúdos para aprovação</h2>
              <p className="text-sm text-muted-foreground mt-2" data-testid="mkt-posts-description">Aprovar, publicar ou agendar — sempre dentro do agente social.</p>
            </div>
            <WorkflowBadge status="approved" testId="mkt-workflow-hint" />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-8" data-testid="mkt-posts">
              {(content.posts || []).map((post, index) => (
                <motion.div key={post.id || index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="surface rounded-[22px] p-5 flex flex-col" data-testid={`mkt-post-${index}`}>
                <PostImageVariantSelector
                  post={post}
                  index={index}
                  busyKey={imgBusy}
                  onGenerate={genImage}
                  onSelectVariant={selectImageVariant}
                  onDownloadSelected={downloadImage}
                />

                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full"
                      style={{ color: FORMAT_COLOR[post.formato] || "#94a3b8", background: `${FORMAT_COLOR[post.formato] || "#94a3b8"}18` }}
                      data-testid={`mkt-post-format-${index}`}
                    >
                      {post.formato}
                    </span>
                    <WorkflowBadge status={post.status} testId={`mkt-post-status-${index}`} />
                  </div>
                  {post.dia && <span className="text-xs text-muted-foreground" data-testid={`mkt-post-day-${index}`}>{post.dia}</span>}
                </div>

                <div className="space-y-3 flex-1">
                  <div className="font-medium text-lg" data-testid={`mkt-post-title-${index}`}>{post.titulo}</div>
                  <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="px-2.5 py-1 rounded-full border border-white/10" data-testid={`mkt-post-theme-${index}`}>Tema: {post.tema}</span>
                    <span className="px-2.5 py-1 rounded-full border border-white/10" data-testid={`mkt-post-goal-${index}`}>Objetivo: {post.objetivo}</span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`mkt-post-caption-${index}`}>{post.legenda}</p>
                  {post.hashtags?.length > 0 && (
                    <div className="text-xs text-[#3B82F6] flex items-start gap-1" data-testid={`mkt-post-hashtags-${index}`}>
                      <Hash className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{post.hashtags.join(" ")}</span>
                    </div>
                  )}
                  {post.cta && <div className="text-sm font-medium text-[#10B981]" data-testid={`mkt-post-cta-${index}`}>{post.cta}</div>}
                  {post.scheduled_at && <p className="text-xs text-amber-300" data-testid={`mkt-post-scheduled-at-${index}`}>Agendado para {new Date(post.scheduled_at).toLocaleString("pt-PT")}</p>}
                </div>

                <div className="flex flex-wrap gap-2 mt-6">
                  <Button data-testid={`mkt-copy-${index}`} onClick={() => copyPost(post)} variant="outline" size="sm" className="rounded-full border-white/15 hover:bg-white/5">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copiar texto
                  </Button>

                  {post.status === "draft" ? (
                    <Button
                      data-testid={`mkt-approve-${index}`}
                      onClick={() => setWorkflowStatus(post.id, "approved")}
                      disabled={workflowBusy === post.id}
                      size="sm"
                      className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
                    >
                      {workflowBusy === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <BadgeCheck className="w-3.5 h-3.5 mr-1.5" />}
                      Aprovar
                    </Button>
                  ) : post.status === "approved" ? (
                    <Button
                      data-testid={`mkt-reset-${index}`}
                      onClick={() => setWorkflowStatus(post.id, "draft")}
                      disabled={workflowBusy === post.id}
                      variant="outline"
                      size="sm"
                      className="rounded-full border-white/15 hover:bg-white/5"
                    >
                      {workflowBusy === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                      Voltar a rascunho
                    </Button>
                  ) : (
                    <span className="text-xs text-amber-300 px-3 py-2 rounded-full border border-amber-400/20 bg-amber-500/10" data-testid={`mkt-scheduled-hint-${index}`}>
                      Para retirar do calendário, cancele o agendamento abaixo.
                    </span>
                  )}
                  {social?.connected && post.status === "approved" && (
                    <>
                      <Button data-testid={`mkt-publish-${index}`} onClick={() => publishNow(post, index)} disabled={busy === index} size="sm" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
                        {busy === index ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                        Publicar
                      </Button>
                      <Button data-testid={`mkt-schedule-${index}`} onClick={() => openSchedule(post)} variant="outline" size="sm" className="rounded-full border-white/15 hover:bg-white/5">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        Agendar
                      </Button>
                    </>
                  )}
                </div>
                </motion.div>
              ))}
            </div>
          </section>

          {content.calendario?.length > 0 && (
            <section id={SECTION_IDS.socialCalendar} className="scroll-mt-24" data-testid="marketing-section-social-editorial-calendar">
              <div className="surface rounded-[22px] p-5 md:p-6" data-testid="mkt-calendar">
              <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
                <div>
                  <h2 className="font-serif-lux text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-[#A78BFA]" /> Calendário editorial</h2>
                  <p className="text-sm text-muted-foreground mt-2" data-testid="mkt-calendar-description">Planeamento social ligado aos conteúdos aprovados.</p>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="mkt-calendar-count">{content.calendario.length} entradas</div>
              </div>
              <div className="grid lg:grid-cols-2 gap-3">
                {content.calendario.map((item, index) => (
                  <div key={`${item.data}-${index}`} className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]" data-testid={`mkt-calendar-item-${index}`}>
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium capitalize" data-testid={`mkt-calendar-day-${index}`}>{item.dia}</p>
                      <p className="text-xs text-muted-foreground" data-testid={`mkt-calendar-date-${index}`}>{item.data}</p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ color: FORMAT_COLOR[item.formato] || "#94a3b8", background: `${FORMAT_COLOR[item.formato] || "#94a3b8"}18` }} data-testid={`mkt-calendar-format-${index}`}>{item.formato}</span>
                        <WorkflowBadge status={item.status || "draft"} testId={`mkt-calendar-status-${index}`} />
                      </div>
                      <p className="text-sm text-foreground" data-testid={`mkt-calendar-theme-${index}`}>{item.tema}</p>
                      <p className="text-xs text-muted-foreground" data-testid={`mkt-calendar-goal-${index}`}>{item.objetivo}</p>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground mt-8" data-testid="mkt-footer-note">
            Fluxo recomendado do Social Media Agent: <b>gerar 3 imagens</b> → <b>ampliar e escolher 1</b> → <b>aprovar</b> → <b>agendar/publicar</b>. Sem ligação às redes, use <b>Guardar imagem</b> e <b>Copiar texto</b> para publicação manual.
          </p>
        </>
      )}
      </AgentWorkspace>

      <Dialog open={!!schedFor} onOpenChange={(open) => !open && setSchedFor(null)}>
        <DialogContent data-testid="mkt-schedule-dialog">
          <DialogHeader>
            <DialogTitle>Agendar publicação</DialogTitle>
            <DialogDescription>
              Escolha a data e hora. A publicação será enviada automaticamente às redes selecionadas da empresa ativa.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-muted-foreground" data-testid="mkt-schedule-label">Data e hora</label>
            <Input type="datetime-local" data-testid="mkt-schedule-when" value={schedWhen} onChange={(event) => setSchedWhen(event.target.value)} className="mt-1" />
            <div className="flex gap-2 mt-4 flex-wrap" data-testid="mkt-schedule-targets">
              <TargetToggle channel="instagram" Icon={Instagram} label="Instagram" enabled={targets.instagram} testId="mkt-schedule-target-instagram" onToggle={() => setTargets((current) => ({ ...current, instagram: !current.instagram }))} />
              <TargetToggle channel="facebook" Icon={Facebook} label="Facebook" enabled={targets.facebook} testId="mkt-schedule-target-facebook" onToggle={() => setTargets((current) => ({ ...current, facebook: !current.facebook }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedFor(null)} className="rounded-full" data-testid="mkt-schedule-cancel">Cancelar</Button>
            <Button data-testid="mkt-schedule-confirm" onClick={confirmSchedule} className="rounded-full bg-[#A78BFA] text-white hover:bg-[#9333EA]">Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rescheduleFor} onOpenChange={(open) => !open && setRescheduleFor(null)}>
        <DialogContent data-testid="mkt-reschedule-dialog">
          <DialogHeader>
            <DialogTitle>Reagendar publicação</DialogTitle>
            <DialogDescription>
              Ajuste a hora da peça em fila sem perder a ligação ao post e ao calendário.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-muted-foreground" data-testid="mkt-reschedule-label">Nova data e hora</label>
            <Input type="datetime-local" data-testid="mkt-reschedule-when" value={rescheduleWhen} onChange={(event) => setRescheduleWhen(event.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleFor(null)} className="rounded-full" data-testid="mkt-reschedule-cancel">Cancelar</Button>
            <Button data-testid="mkt-reschedule-confirm" onClick={confirmReschedule} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">Guardar nova hora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Marketing;