import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Unlink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

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
  const [activeMode, setActiveMode] = useState("token"); // "token" | "oauth" | "config"

  // Form states
  const [devToken, setDevToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [configId, setConfigId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igUserId, setIgUserId] = useState("");

  const loadStatus = async () => {
    try {
      const res = await api.get("/social/status");
      setData(res.data || {});
    } catch (e) {
      console.error("Erro ao carregar estado social:", e);
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
      toast.success("Diagnóstico da Meta executado com sucesso!");
    } catch (e) {
      toast.error("Erro ao validar ligação com a Meta.");
    } finally {
      setDiagnosticsBusy(false);
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

  return (
    <div className="space-y-6">
      {/* Estado da Ligação Atual */}
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
                ? `Ligado com sucesso à Página Facebook "${data.page_name || 'Ativa'}" e ao Instagram ${data.ig_username ? `@${data.ig_username}` : 'Profissional'}.`
                : "Conecte a sua conta para publicar conteúdos e recolher métricas reais no Studio, Content Pool e Autopilot."}
            </p>

            {data.connected && (
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl border border-white/10 bg-black/30">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Página de Facebook</span>
                  <p className="text-sm font-semibold text-white mt-0.5">{data.page_name || "Página Ligada"}</p>
                  <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Publicação Pronta
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
              {diagnosticsBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5 text-blue-400" />}
              Validar Ligação
            </Button>
            {data.connected && (
              <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm" className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10">
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Unlink className="w-4 h-4 mr-1.5" />}
                Desligar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Painel de Configuração / Conexão */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <h4 className="font-bold text-white">Métodos de Ligação com Meta</h4>
          </div>
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveMode("token")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMode === "token" ? "bg-pink-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              ⚡ Token do Developer (Direto)
            </button>
            <button
              onClick={() => setActiveMode("oauth")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMode === "oauth" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              🔗 Facebook Login (OAuth)
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

        {/* 1. MODO TOKEN DIRETO (RECOMENDADO PARA DEVELOPERS) */}
        {activeMode === "token" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-pink-500/20 bg-pink-500/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> Conexão Imediata via Meta for Developers (Graph API Token)
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
                Cole o seu <strong>Page Access Token</strong>, <strong>User Access Token</strong> ou <strong>System User Token</strong> gerado no portal Meta for Developers. O CEO AI deteta automaticamente as páginas e contas de Instagram vinculadas.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Token de Acesso da Meta (Access Token) *
              </label>
              <Textarea
                rows={3}
                placeholder="Ex: EAAQ... (Cole aqui o token de acesso de longa duração ou do Graph Explorer)"
                value={devToken}
                onChange={(e) => setDevToken(e.target.value)}
                className="bg-white/[0.03] border-white/10 text-white font-mono text-xs focus:border-pink-500"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">ID da Página Facebook (Opcional)</label>
                <Input
                  placeholder="Ex: 104829102938491"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  className="bg-white/[0.03] border-white/10 text-white text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">ID da Conta Instagram Business (Opcional)</label>
                <Input
                  placeholder="Ex: 178414002938491"
                  value={igUserId}
                  onChange={(e) => setIgUserId(e.target.value)}
                  className="bg-white/[0.03] border-white/10 text-white text-xs"
                />
              </div>
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

        {/* 2. MODO OAUTH PADRÃO */}
        {activeMode === "oauth" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <Facebook className="w-4 h-4" /> Fluxo de Autorização Facebook Login
              </span>
              <p className="text-xs text-slate-300">
                Inicie sessão na sua conta Meta para conceder acesso às Páginas de Facebook e Contas de Instagram geridas pela sua empresa.
              </p>
              <p className="text-[11px] text-slate-400 break-all font-mono">
                Redirect URI configurado: <span className="text-blue-300">{data.redirect_uri}</span>
              </p>
            </div>

            <Button
              onClick={handleConnectOAuth}
              disabled={!data.configured}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 shadow-lg disabled:opacity-50"
            >
              <Facebook className="w-4 h-4 mr-2" />
              {data.configured ? "Entrar com Facebook / Meta" : "Requer App ID e Secret (Configure na aba ao lado)"}
            </Button>
          </div>
        )}

        {/* 3. CONFIGURAÇÃO DE APP ID & SECRET */}
        {activeMode === "config" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-2">
              <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <Settings2 className="w-4 h-4" /> Configuração Global da App no Meta for Developers
              </span>
              <p className="text-xs text-slate-300">
                Registe aqui o <strong>App ID</strong> e <strong>App Secret</strong> da sua aplicação Meta.
              </p>
            </div>

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
                  placeholder="Ex: d41d8cd98f00b204e9800998ecf8427e"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="bg-white/[0.03] border-white/10 text-white text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">Meta Config ID (Opcional - Facebook Login for Business)</label>
              <Input
                placeholder="Ex: 192837465019283"
                value={configId}
                onChange={(e) => setConfigId(e.target.value)}
                className="bg-white/[0.03] border-white/10 text-white text-xs"
              />
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

      {/* Checklist de Permissões */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
        <h4 className="font-bold text-white text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Checklist de Validação da Meta
        </h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(data.checks || []).map((c, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-1">
              <div className="flex items-center gap-2">
                {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                <p className="text-xs font-bold text-white line-clamp-1">{c.label}</p>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};