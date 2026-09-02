import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Video,
  ShieldCheck,
  Unlink,
  Settings2,
  Flame,
  KeyRound
} from "lucide-react";
import { toast } from "sonner";

export const TikTokConnectionSection = ({ api, onRefreshAll }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ configured: false, connected: false });
  const [savingConfig, setSavingConfig] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Form states
  const [clientKey, setClientKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const loadStatus = async () => {
    try {
      const res = await api.get("/tiktok/status");
      setData(res.data || {});
    } catch (e) {
      console.error("Erro ao carregar status do TikTok:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnectOAuth = async () => {
    try {
      const res = await api.get("/tiktok/connect");
      if (res.data?.auth_url) {
        window.location.href = res.data.auth_url;
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao iniciar OAuth do TikTok.");
    }
  };

  const handleSaveConfig = async () => {
    if (!clientKey.trim() || !clientSecret.trim()) {
      toast.error("Preencha o Client Key e o Client Secret.");
      return;
    }
    setSavingConfig(true);
    try {
      await api.post("/tiktok/config", {
        client_key: clientKey.trim(),
        client_secret: clientSecret.trim(),
      });
      toast.success("Credenciais do TikTok Developers guardadas com sucesso!");
      loadStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao guardar credenciais do TikTok.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Deseja desligar a conta do TikTok?")) return;
    setDisconnecting(true);
    try {
      await api.post("/tiktok/disconnect");
      toast.success("Conta do TikTok desligada com sucesso.");
      loadStatus();
      if (onRefreshAll) onRefreshAll();
    } catch (e) {
      toast.error("Erro ao desligar conta do TikTok.");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 rounded-2xl border border-white/10 bg-black/20 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-black/40 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-black border border-white/20 flex items-center justify-center text-white font-black text-xs">
                TT
              </div>
              <h3 className="text-lg font-bold text-white">TikTok Content Posting API & Login Kit</h3>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${
                data.connected
                  ? "text-emerald-300 bg-emerald-500/20 border-emerald-400/30"
                  : "text-slate-300 bg-slate-500/20 border-slate-400/20"
              }`}
            >
              {data.connected && <CheckCircle2 className="w-3.5 h-3.5" />}
              {data.connected ? "Conta Conectada & Ativa" : "Não Conectado"}
            </span>
          </div>

          <p className="text-sm text-slate-300">
            {data.connected
              ? `Conectado ao perfil TikTok @${data.username || data.display_name || 'ObeliscoLabs'}. Permissão de publicação de vídeos automáticos e estatísticas ativa.`
              : "Conecte a sua conta do TikTok Developers para publicar vídeos verticais (Reels/TikToks) e acompanhar o alcance."}
          </p>

          {data.connected && (
            <div className="p-3 rounded-xl border border-white/10 bg-black/30 flex items-center gap-4">
              {data.avatar_url ? (
                <img src={data.avatar_url} alt="Avatar" className="w-10 h-10 rounded-full border border-white/20" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-sm">
                  TT
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-white">{data.display_name || data.username || "Conta TikTok"}</p>
                <span className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Publicação de Vídeos Pronta & Ativa
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.connected ? (
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              variant="outline"
              size="sm"
              className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Unlink className="w-4 h-4 mr-1.5" />}
              Desligar TikTok
            </Button>
          ) : (
            <Button
              onClick={() => setShowConfig(!showConfig)}
              variant="outline"
              size="sm"
              className="rounded-xl border-white/15 text-slate-300 hover:bg-white/10"
            >
              <Settings2 className="w-4 h-4 mr-1.5 text-pink-400" />
              {showConfig ? "Ocultar Chaves" : "Configurar Chaves da App"}
            </Button>
          )}
        </div>
      </div>

      {(!data.connected || showConfig) && (
        <div className="p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 via-black/40 to-pink-950/20 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <Video className="w-4 h-4" />
              </span>
              <h4 className="font-bold text-white text-sm">Autenticação 1-Clique TikTok Developers</h4>
            </div>
            {data.configured && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> App Oficial Configurada ({data.client_key ? `${data.client_key.slice(0, 4)}••••` : 'awes••••'})
              </span>
            )}
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-300">
                A aplicação <strong>CEO AI</strong> no TikTok for Developers está configurada para login e publicação direta de vídeos.
              </span>
              <a
                href="https://developers.tiktok.com/apps"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline"
              >
                Painel TikTok Developers <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="pt-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Redirect URI de Callback:</span>
              <code className="text-xs text-cyan-300 font-mono bg-black/60 px-2.5 py-1 rounded mt-1 block select-all border border-white/10">
                {data.redirect_uri || "https://ceo-ai-app-production.up.railway.app/api/tiktok/callback"}
              </code>
            </div>
          </div>

          {/* Botão de 1-Clique Principal */}
          <Button
            onClick={handleConnectOAuth}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-pink-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold py-4 text-sm shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
          >
            <Video className="w-5 h-5" />
            <span>Entrar com TikTok & Autorizar Automação</span>
          </Button>

          {/* Drawer / Configuração Manual de Chaves */}
          <div className="pt-3 border-t border-white/10">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-pink-400" />
              {showConfig ? "Ocultar campos de credenciais" : "Ver / Alterar Client Key & Client Secret da App"}
            </button>

            {showConfig && (
              <div className="grid sm:grid-cols-2 gap-3 pt-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400">TikTok Client Key</label>
                  <Input
                    placeholder="Ex: awes1an73ukfkebw"
                    value={clientKey}
                    onChange={(e) => setClientKey(e.target.value)}
                    className="bg-white/[0.03] border-white/10 text-white text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400">TikTok Client Secret</label>
                  <Input
                    type="password"
                    placeholder="Ex: vRH35UF8uX91..."
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="bg-white/[0.03] border-white/10 text-white text-xs font-mono mt-1"
                  />
                </div>
                <div className="sm:col-span-2 pt-2">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={savingConfig || !clientKey.trim() || !clientSecret.trim()}
                    size="sm"
                    className="w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                  >
                    {savingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Guardar Chaves no Backend
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
