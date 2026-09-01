import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Split, Sparkles, Loader2, Trophy, BarChart3, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const ExperimentsSection = ({ experiments = [], poolItems = [], onRefresh, api }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [variantAId, setVariantAId] = useState("");
  const [variantBId, setVariantBId] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [metricTarget, setMetricTarget] = useState("engagement_rate");
  const [saving, setSaving] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState(null);

  const handleCreate = async () => {
    if (!name.trim() || !variantAId || !variantBId) {
      toast.error("Preencha o nome e selecione as duas variantes.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/marketing/experiments", {
        name,
        variant_a_id: variantAId,
        variant_b_id: variantBId,
        hypothesis,
        metric_target: metricTarget
      });
      toast.success("Teste A/B criado e colocado em execução!");
      setModalOpen(false);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao criar teste A/B.");
    } finally {
      setSaving(false);
    }
  };

  const handleEvaluate = async (expId) => {
    setEvaluatingId(expId);
    try {
      const res = await api.post(`/marketing/experiments/${expId}/evaluate`);
      toast.success(res.data?.insight || "Experimento avaliado com sucesso!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao avaliar experimento.");
    } finally {
      setEvaluatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Split className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Variações & Testes A/B</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Compare variantes de Gancho, CTA e Copy. O vencedor alimenta automaticamente o Feedback Loop do Growth Engine.
          </p>
        </div>

        <Button onClick={() => setModalOpen(true)} className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold">
          <Split className="w-4 h-4 mr-2" /> Novo Teste A/B
        </Button>
      </div>

      {/* Grid de Experimentos */}
      {experiments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
          <Split className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-white">Nenhum teste A/B registado</h3>
          <p className="text-sm text-slate-400 mt-1">Crie testes entre duas peças do Content Pool para descobrir os ganchos vencedores.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {experiments.map((exp) => (
            <div key={exp.id} className="p-5 rounded-2xl border border-white/10 bg-[#0B0F17] flex flex-col justify-between space-y-4 shadow-lg">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    exp.status === "COMPLETED"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  }`}>
                    {exp.status === "COMPLETED" ? "Concluído com Vencedor" : "Em Execução"}
                  </span>
                  <span className="text-xs text-slate-400">Alvo: {exp.metric_target}</span>
                </div>

                <h3 className="text-base font-bold text-white mt-2">{exp.name}</h3>
                {exp.hypothesis && <p className="text-xs text-slate-400 mt-1"><strong>Hipótese:</strong> {exp.hypothesis}</p>}

                {/* Comparador de Métricas */}
                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/10">
                  <div className={`p-3 rounded-xl border ${exp.winner_variant_id === exp.variant_a_id ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/5 bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Variante A</span>
                      {exp.winner_variant_id === exp.variant_a_id && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 truncate">{exp.variant_a?.title || "Original"}</p>
                    <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                      <p>Engagement: <strong className="text-white">{exp.variant_a_metrics?.engagement_rate || 0}%</strong></p>
                      <p>Clicks: <strong className="text-white">{exp.variant_a_metrics?.clicks || 0}</strong></p>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border ${exp.winner_variant_id === exp.variant_b_id ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/5 bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Variante B</span>
                      {exp.winner_variant_id === exp.variant_b_id && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 truncate">{exp.variant_b?.title || "Otimizada"}</p>
                    <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                      <p>Engagement: <strong className="text-white">{exp.variant_b_metrics?.engagement_rate || 0}%</strong></p>
                      <p>Clicks: <strong className="text-white">{exp.variant_b_metrics?.clicks || 0}</strong></p>
                    </div>
                  </div>
                </div>

                {exp.winning_insight && (
                  <p className="text-xs text-emerald-300 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mt-3">
                    🏆 <strong>Insight Vencedor:</strong> {exp.winning_insight}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-white/5 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleEvaluate(exp.id)}
                  disabled={evaluatingId === exp.id || exp.status === "COMPLETED"}
                  className="rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-xs font-bold border border-purple-500/30"
                >
                  {evaluatingId === exp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <BarChart3 className="w-3.5 h-3.5 mr-1" />}
                  {exp.status === "COMPLETED" ? "Re-avaliar Vencedor" : "Avaliar Vencedor & Gerar Insight"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
