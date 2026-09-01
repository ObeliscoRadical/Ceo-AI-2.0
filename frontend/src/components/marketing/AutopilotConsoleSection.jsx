import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bot, Sparkles, Loader2, Play, CheckCircle2, XCircle, ShieldCheck, History, Sliders, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const AutopilotConsoleSection = ({ configData = {}, logs = [], onRefresh, api }) => {
  const [mode, setMode] = useState(configData.mode || "ASSISTIDO");
  const [permissions, setPermissions] = useState(configData.permissions || {
    ajustar_horarios: true,
    gerar_variacoes: true,
    executar_ab: true,
    alterar_frequencia: false,
    redistribuir_pesos: true,
    pausar_fraco: true,
    priorizar_vencedor: true,
    gerar_novos_conteudos: true,
    remix_estrategia: true,
  });
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const handleTogglePermission = (key) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await api.post("/marketing/autopilot/config", {
        mode,
        permissions
      });
      toast.success("Configurações do Autopilot atualizadas!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao guardar configuração do Autopilot.");
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerCycle = async () => {
    setTriggering(true);
    try {
      const res = await api.post("/marketing/autopilot/trigger-cycle");
      toast.success(res.data?.message || "Ciclo do Autopilot executado com sucesso!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao executar ciclo do Autopilot.");
    } finally {
      setTriggering(false);
    }
  };

  const handleDecide = async (actionId, decision) => {
    try {
      await api.post(`/marketing/autopilot/action/${actionId}/decide`, { decision });
      toast.success(decision === "APPROVE" ? "Ação aprovada e executada!" : "Ação rejeitada.");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao processar decisão.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Growth Engine & Consola do Autopilot</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Executores reais com limites estritos, regras de auditoria e controle total (OFF, ASSISTIDO ou AUTOMÁTICO).
          </p>
        </div>

        <Button onClick={handleTriggerCycle} disabled={triggering} className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/20">
          {triggering ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          Executar Ciclo do Autopilot Agora
        </Button>
      </div>

      {/* Seleção de Modo */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { id: "OFF", title: "OFF", desc: "Apenas analisa e exibe métricas. Não altera nada." },
          { id: "ASSISTIDO", title: "ASSISTIDO (Recomendado)", desc: "Formula recomendações e espera aprovação antes de executar." },
          { id: "AUTOMATICO", title: "AUTOMÁTICO", desc: "Executa autonomamente dentro dos limites autorizados." }
        ].map((m) => (
          <div
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`p-5 rounded-2xl border cursor-pointer transition-all ${
              mode === m.id
                ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <p className="text-sm font-black text-white">{m.title}</p>
            <p className="text-xs text-slate-400 mt-1">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Matriz de Permissões com Executores Reais */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" /> Matriz de Permissões do Executor
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            { key: "ajustar_horarios", label: "Otimizar Horários do Scheduler", desc: "Ajusta slots para os horários de maior engagement comprovado." },
            { key: "gerar_variacoes", label: "Gerar Novas Variações no Studio", desc: "Cria variantes A/B automáticas para os melhores conteúdos." },
            { key: "executar_ab", label: "Executar Testes A/B", desc: "Coloca duas variantes em disputa e avalia o vencedor." },
            { key: "pausar_fraco", label: "Pausar Conteúdo com Baixo Desempenho", desc: "Pausa posts que fiquem 50% abaixo da média de engagement." },
            { key: "priorizar_vencedor", label: "Priorizar Ganchos e Formatos Vencedores", desc: "Aumenta o peso das campanhas de maior conversão." },
            { key: "gerar_novos_conteudos", label: "Abastecer Content Pool (Runway < 3 dias)", desc: "Aciona o Studio automaticamente para evitar falta de estoque." }
          ].map((perm) => (
            <div key={perm.key} className="p-4 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">{perm.label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{perm.desc}</p>
              </div>
              <Switch checked={!!permissions[perm.key]} onCheckedChange={() => handleTogglePermission(perm.key)} />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveConfig} disabled={saving} className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold px-6">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Guardar Permissões
          </Button>
        </div>
      </div>

      {/* Log de Auditoria & Recomendações */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" /> Log de Auditoria e Recomendações
        </h3>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma ação recente registada no log do Autopilot.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="p-4 rounded-xl border border-white/10 bg-[#0B0F17] flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                      {log.action_type}
                    </span>
                    <span className="text-xs font-bold text-white">{log.title}</span>
                  </div>
                  <p className="text-xs text-slate-400">{log.reason}</p>
                  {log.result && <p className="text-xs text-emerald-400 mt-1"><strong>Resultado:</strong> {log.result}</p>}
                </div>

                {log.status === "PENDING_APPROVAL" ? (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => handleDecide(log.id, "APPROVE")} className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
                      Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDecide(log.id, "REJECT")} className="h-8 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs">
                      Rejeitar
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    {log.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
