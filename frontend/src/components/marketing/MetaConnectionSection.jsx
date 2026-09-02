import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Facebook,
  Instagram,
  KeyRound,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Unlink,
  Zap,
  Edit3,
  X
} from "lucide-react";
import { toast } from "sonner";
import { TikTokConnectionSection } from "./TikTokConnectionSection";

const STATE_META = {
  not_connected: { label: "Não ligada", tone: "text-slate-300 bg-slate-500/20 border-slate-400/20" },
  pending_selection: { label: "Escolher página", tone: "text-amber-300 bg-amber-500/20 border-amber-400/30" },
  connected: { label: "Ligação Ativa & Pronta", tone: "text-emerald-300 bg-emerald-500/20 border-emerald-400/30" },
  degraded: { label: "Precisa de rever", tone: "text-red-300 bg-red-500/20 border-red-400/30" },
};

export const MetaConnectionSection = ({ api, onRefreshAll }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ configured: false, connected: false, checks: [], available_pages: [] });
  const [connectingDev, setConnectingDev] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showReconfig, setShowReconfig] = useState(false);
  const [activeMode, setActiveMode] = useState("oauth"); // "oauth" | "token" | "config"

  // Jobs & History state
  const [jobs, setJobs] = useState([]);
  const [publishedPosts, setPublishedPosts] = useState([]);
  const [publishingJobId, setPublishingJobId] = useState(null);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [editCaption, setEditCaption] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editRunAt, setEditRunAt] = useState("");
  const [savingJob, setSavingJob] = useState(false);

  // Form states
  const [devToken, setDevToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [configId, setConfigId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igUserId, setIgUserId] = useState("");

  const loadStatus = async () => {
    try {
      const [resStatus, resJobs, resHist] = await Promise.all([
        api.get("/social/status"),
        api.get("/social/jobs").catch(() => ({ data: { jobs: [] } })),
        api.get("/social/published-history").catch(() => ({ data: { posts: [] } }))
      ]);
      setData(resStatus.data || {});
      setJobs(resJobs.data?.jobs || []);
      setPublishedPosts(resHist.data?.posts || []);
    } catch (e) {
      console.error("Erro ao carregar dados sociais:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnectOAuth = async () => {
    try {
      const res = await api.get("/social/connect");
      if (res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao iniciar OAuth da Meta.");
    }
  };

  const handleConnectDeveloper = async () => {
    if (!devToken.trim()) {
      toast.error("Por favor insira o Token de Acesso (Page Access Token ou User Token).");
      return;
    }
    setConnectingDev(true);
    try {
      const payload = {
        access_token: devToken.trim(),
        app_id: appId.trim() || null,
        app_secret: appSecret.trim() || null,
        config_id: configId.trim() || null,
        page_id: pageId.trim() || null,
        ig_user_id: igUserId.trim() || null,
      };
      const res = await api.post("/social/connect-developer", payload);
      toast.success(res.data?.message || "Ligação Meta & Instagram concluída com sucesso!");
      setShowReconfig(false);
      loadStatus();
      if (onRefreshAll) onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao validar token com a Meta Graph API.");
    } finally {
      setConnectingDev(false);
    }
  };

  const handleSaveAppConfig = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      toast.error("Preencha o App ID e o App Secret.");
      return;
    }
    setSavingConfig(true);
    try {
      await api.post("/social/config", {
        app_id: appId.trim(),
        app_secret: appSecret.trim(),
        config_id: configId.trim() || null,
      });
      toast.success("Credenciais da Meta App guardadas com sucesso!");
      loadStatus();
    } catch (e) {
      toast.error("Erro ao guardar credenciais da Meta App.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagnosticsBusy(true);
    try {
      const res = await api.post("/social/diagnostics");
      setData(res.data || {});
      toast.success("Conexão com a Meta testada e 100% validada!");
    } catch (e) {
      toast.error("Erro ao validar ligação com a Meta.");
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const handlePublishJobNow = async (jobId) => {
    setPublishingJobId(jobId);
    try {
      const res = await api.post(`/social/jobs/${jobId}/publish-now`);
      toast.success(res.data?.message || "Publicação disparada com sucesso para as redes!");
      loadStatus();
      if (onRefreshAll) onRefreshAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao publicar imediatamente.");
    } finally {
      setPublishingJobId(null);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm("Deseja cancelar e remover este agendamento?")) return;
    setDeletingJobId(jobId);
    try {
      await api.delete(`/social/jobs/${jobId}`);
      toast.success("Agendamento removido.");
      loadStatus();
    } catch (e) {
      toast.error("Erro ao remover agendamento.");
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleOpenEditJob = (job) => {
    setEditingJob(job);
    setEditCaption(job.caption || "");
    setEditImageUrl(job.image_url || "");
    setEditRunAt(job.run_at ? new Date(job.run_at).toISOString().slice(0, 16) : "");
  };

  const handleSaveEditJob = async () => {
    if (!editingJob) return;
    setSavingJob(true);
    try {
      const payload = {
        caption: editCaption,
        image_url: editImageUrl,
        run_at: editRunAt ? new Date(editRunAt).toISOString() : editingJob.run_at,
      };
      await api.put(`/social/jobs/${editingJob.id}`, payload);
      toast.success("Publicação atualizada com sucesso!");
      setEditingJob(null);
      loadStatus();
    } catch (e) {
      toast.error("Erro ao atualizar agendamento.");
    } finally {
      setSavingJob(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Tem a certeza que deseja desligar a conta Meta (Facebook & Instagram)?")) return;
    setDisconnecting(true);
    try {
      await api.post("/social/disconnect");
      toast.success("Conta Meta desligada com sucesso.");
      loadStatus();
      if (onRefreshAll) onRefreshAll();
    } catch (e) {
      toast.error("Erro ao desligar conta.");
    } finally {
      setDisconnecting(false);
    }
  };

  const state = data.connection_state || (data.connected ? "connected" : "not_connected");
  const metaBadge = STATE_META[state] || STATE_META.not_connected;

  if (loading) {
    return (
      <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
        <p className="text-sm text-slate-400">A verificar estado da ligação Meta...</p>
      </div>
    );
  }

  const queuedJobs = jobs.filter(j => j.status === "queued" || j.status === "QUEUED");
  const pastJobs = jobs.filter(j => j.status !== "queued" && j.status !== "QUEUED");

  return (
    <div className="space-y-6">
      {/* 1. ESTADO DA CONEXÃO PRINCIPAL */}
      <div className="p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-black/40 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-400" />
                <Instagram className="w-5 h-5 text-pink-400" />
                <h3 className="text-lg font-bold text-white">Meta Graph API · Facebook & Instagram</h3>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${metaBadge.tone}`}>
                {data.connected && <CheckCircle2 className="w-3.5 h-3.5" />}
                {metaBadge.label}
              </span>
            </div>

            <p className="text-sm text-slate-300">
              {data.connected
                ? `Ligado com sucesso à Página Facebook "${data.page_name || 'ObeliscoLabs'}" e ao Instagram Business. Todas as permissões de publicação e analytics estão ativas.`
                : "Conecte a sua conta para publicar conteúdos e recolher métricas reais no Studio, Content Pool e Autopilot."}
            </p>

            {data.connected && (
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl border border-white/10 bg-black/30">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Página de Facebook</span>
                  <p className="text-sm font-semibold text-white mt-0.5">{data.page_name || "ObeliscoLabs"}</p>
                  <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Publicação Pronta & Ativa
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-black/30">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Instagram Business</span>
                  <p className="text-sm font-semibold text-white mt-0.5">{data.ig_username ? `@${data.ig_username}` : "Conta Conectada"}</p>
                  <span className="text-xs text-pink-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Feed & Carrossel Prontos
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleRunDiagnostics} disabled={diagnosticsBusy} variant="outline" size="sm" className="rounded-xl border-white/15 text-slate-200 hover:bg-white/10">
              {diagnosticsBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5 text-emerald-400" />}
              Testar Conexão em Tempo Real
            </Button>
            {data.connected && (
              <>
                <Button onClick={() => setShowReconfig(!showReconfig)} variant="outline" size="sm" className="rounded-xl border-white/15 text-slate-300 hover:bg-white/10">
                  <Settings2 className="w-4 h-4 mr-1.5 text-pink-400" />
                  {showReconfig ? "Ocultar Formulário" : "Trocar Token / Reconfigurar"}
                </Button>
                <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm" className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10">
                  {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Unlink className="w-4 h-4 mr-1.5" />}
                  Desligar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. FORMULÁRIO DE RECONFIGURAÇÃO / CONEXÃO (CONDICIONAL) */}
      {(!data.connected || showReconfig) && (
        <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              <h4 className="font-bold text-white">Conexão Oficial com Meta (Facebook & Instagram)</h4>
            </div>
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveMode("oauth")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeMode === "oauth" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                🔗 Facebook Login (Recomendado)
              </button>
              <button
                onClick={() => setActiveMode("token")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeMode === "token" ? "bg-pink-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                ⚡ Token Direto
              </button>
              <button
                onClick={() => setActiveMode("config")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeMode === "config" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                ⚙️ Chaves da App
              </button>
            </div>
          </div>

          {activeMode === "oauth" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <Facebook className="w-4 h-4" /> Fluxo Oficial de Login com o Facebook
                </span>
                <p className="text-xs text-slate-300">
                  Clique no botão abaixo para abrir a janela da Meta. Inicie sessão com a sua conta e autorize a Página <strong>ObeliscoLabs</strong> e o Instagram. O sistema faz a ligação automática de tudo sem precisar de colar tokens manuais.
                </p>
              </div>

              {!data.configured && (
                <div className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-3">
                  <p className="text-xs text-amber-300 font-semibold">
                    Para iniciar o Facebook Login, confirme o seu Meta App ID e App Secret:
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400">Meta App ID</label>
                      <Input
                        placeholder="Ex: 849204829102938"
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        className="bg-white/[0.03] border-white/10 text-white text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400">Meta App Secret</label>
                      <Input
                        type="password"
                        placeholder="Ex: d41d8cd98f00b204e9800998ecf8427e"
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                        className="bg-white/[0.03] border-white/10 text-white text-xs font-mono mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={async () => {
                  if (!data.configured && (appId.trim() && appSecret.trim())) {
                    await handleSaveAppConfig();
                  }
                  handleConnectOAuth();
                }}
                disabled={!data.configured && (!appId.trim() || !appSecret.trim())}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 text-sm shadow-xl flex items-center justify-center gap-2"
              >
                <Facebook className="w-5 h-5 fill-current" />
                <span>Entrar com Facebook & Autorizar Automação</span>
              </Button>
            </div>
          )}

          {activeMode === "token" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-pink-500/20 bg-pink-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-pink-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" /> Conexão Imediata via Meta for Developers
                  </span>
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-pink-400 hover:text-pink-300 flex items-center gap-1 underline"
                  >
                    Abrir Graph API Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-slate-300">
                  Cole o seu <strong>Page Access Token</strong> ou <strong>User Access Token</strong>. O CEO AI deteta automaticamente as páginas vinculadas.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Token de Acesso da Meta (Access Token) *
                </label>
                <Textarea
                  rows={3}
                  placeholder="Ex: EAAQ..."
                  value={devToken}
                  onChange={(e) => setDevToken(e.target.value)}
                  className="bg-white/[0.03] border-white/10 text-white font-mono text-xs focus:border-pink-500"
                />
              </div>

              <Button
                onClick={handleConnectDeveloper}
                disabled={connectingDev || !devToken.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 shadow-lg"
              >
                {connectingDev ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2 text-amber-300" />}
                Validar Token & Conectar Redes Sociais
              </Button>
            </div>
          )}

          {activeMode === "config" && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Meta App ID *</label>
                  <Input
                    placeholder="Ex: 849204829102938"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="bg-white/[0.03] border-white/10 text-white text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Meta App Secret *</label>
                  <Input
                    type="password"
                    placeholder="Ex: d41d8cd9..."
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="bg-white/[0.03] border-white/10 text-white text-xs font-mono"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveAppConfig}
                disabled={savingConfig || !appId.trim() || !appSecret.trim()}
                className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold py-3"
              >
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Guardar Credenciais da App
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2.5 TIKTOK CONTENT POSTING & LOGIN KIT */}
      <TikTokConnectionSection api={api} onRefreshAll={onRefreshAll} />

      {/* 3. FILA DE POSTAGENS PROGRAMADAS ("TAL HORA VAI SAIR ESSE POST") */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-pink-400" />
            <h4 className="font-bold text-white">Cronograma & Fila de Publicações</h4>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-semibold border border-pink-500/30">
              {queuedJobs.length} agendados
            </span>
          </div>
          <Button onClick={loadStatus} variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar Fila
          </Button>
        </div>

        {queuedJobs.length === 0 ? (
          <div className="p-8 rounded-xl border border-white/5 bg-black/20 text-center space-y-2">
            <Calendar className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-white">Não há publicações em fila neste momento</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Vá ao <strong>Criador 360°</strong> ou ao <strong>Studio</strong>, gere e aprove conteúdos ou ative o <strong>Autopilot</strong> para preencher automaticamente o cronograma!
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {queuedJobs.map((job) => {
              const runDate = job.run_at ? new Date(job.run_at) : null;
              const formattedDate = runDate ? runDate.toLocaleString("pt-PT", {
                weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
              }) : "Horário Pendente";

              return (
                <div key={job.id} className="p-4 rounded-xl border border-white/10 bg-gradient-to-r from-black/40 to-white/[0.02] flex items-center justify-between gap-4 flex-wrap hover:border-pink-500/30 transition-all">
                  <div className="flex items-center gap-3.5 min-w-[280px] max-w-xl">
                    {job.image_url ? (
                      <img src={job.image_url} alt="Thumbnail" className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Instagram className="w-6 h-6 text-slate-500" />
                      </div>
                    )}
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          🕒 {formattedDate}
                        </span>
                        {(job.platforms || ["Instagram"]).map((p, i) => (
                          <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-500/10 text-pink-300">
                            {p}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs font-semibold text-white line-clamp-1">{job.title || "Publicação"}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{job.caption || "Sem legenda"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={() => handlePublishJobNow(job.id)}
                      disabled={publishingJobId === job.id}
                      size="sm"
                      className="rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs shadow-md"
                    >
                      {publishingJobId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />}
                      Publicar Agora
                    </Button>
                    <Button
                      onClick={() => handleOpenEditJob(job)}
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-white/15 text-slate-300 hover:bg-white/10 text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      onClick={() => handleDeleteJob(job.id)}
                      disabled={deletingJobId === job.id}
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs"
                    >
                      {deletingJobId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. HISTÓRICO DE PUBLICAÇÕES REALIZADAS */}
      {publishedPosts.length > 0 && (
        <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h4 className="font-bold text-white">Histórico de Publicações Realizadas</h4>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                {publishedPosts.length} posts
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {publishedPosts.map((post) => (
              <div key={post.id} className="p-3.5 rounded-xl border border-white/10 bg-black/30 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-2">
                  {post.image_url && (
                    <img src={post.image_url} alt="Post" className="w-full h-32 rounded-lg object-cover border border-white/10" />
                  )}
                  <div>
                    <span className="text-[10px] text-slate-400">
                      Publicado em {new Date(post.created_at).toLocaleString("pt-PT")}
                    </span>
                    <p className="text-xs font-bold text-white mt-0.5 line-clamp-1">{post.post_title}</p>
                    <p className="text-[11px] text-slate-300 line-clamp-2 mt-1">{post.caption}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Meta Graph OK
                  </span>
                  {post.results?.facebook?.id && (
                    <span className="text-[10px] text-blue-400 font-mono">
                      FB ID: {String(post.results.facebook.id).slice(-6)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. MODAL DE EDIÇÃO DE POST */}
      {editingJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-white/15 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-pink-400" /> Editar Publicação Agendada
              </h3>
              <button onClick={() => setEditingJob(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Data e Hora de Saída</label>
                <Input
                  type="datetime-local"
                  value={editRunAt}
                  onChange={(e) => setEditRunAt(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Legenda da Publicação</label>
                <Textarea
                  rows={4}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">URL da Imagem</label>
                <Input
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <Button onClick={() => setEditingJob(null)} variant="ghost" size="sm" className="text-slate-400">
                Cancelar
              </Button>
              <Button onClick={handleSaveEditJob} disabled={savingJob} size="sm" className="bg-pink-600 hover:bg-pink-500 text-white font-bold">
                {savingJob ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                Guardar Alterações
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};