import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Share2, Sparkles, Loader2, Clock, ShieldCheck, Zap, Sliders, CalendarDays, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const PostingPlanSection = ({ plan = {}, onRefresh, onGenerateSlots, api }) => {
  const [dailyPosts, setDailyPosts] = useState(plan.daily_posts || 4);
  const [mode, setMode] = useState(plan.mode || "UNIFORME");
  const [windowStart, setWindowStart] = useState(plan.window_start || "08:00");
  const [windowEnd, setWindowEnd] = useState(plan.window_end || "22:00");
  const [antiCannibalization, setAntiCannibalization] = useState(plan.anti_cannibalization !== false);
  const [saving, setSaving] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/marketing/posting-plan", {
        daily_posts: parseInt(dailyPosts) || 4,
        mode,
        window_start: windowStart,
        window_end: windowEnd,
        anti_cannibalization: antiCannibalization
      });
      toast.success("Plano de postagens gravado com sucesso!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao gravar plano.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunScheduler = async () => {
    setGeneratingSlots(true);
    try {
      const res = await api.post("/marketing/scheduler/generate-slots");
      toast.success(res.data?.message || "Grade de agendamento gerada com sucesso!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao gerar agendamentos automáticos.");
    } finally {
      setGeneratingSlots(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Postagens, Frequência & Distribuição</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Configure a cadência diária (1 a 24 posts/dia), janelas de horário e regras de anti-canibalização de marca.
          </p>
        </div>

        <Button onClick={handleRunScheduler} disabled={generatingSlots} className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold shadow-lg">
          {generatingSlots ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2 text-amber-300" />}
          Distribuir Estoque no Calendário
        </Button>
      </div>

      {/* Card de Configuração */}
      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-6">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Frequência */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Frequência Diária</label>
            <Select value={String(dailyPosts)} onValueChange={(v) => setDailyPosts(Number(v))}>
              <SelectTrigger className="bg-white/[0.03] border-white/10 text-white font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                {[1, 2, 3, 4, 6, 8, 12, 24].map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f} posts / dia {f === 24 ? "(1 por hora)" : f === 12 ? "(1 a cada 2h)" : f === 4 ? "(Padrão)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">Total semanal: {dailyPosts * 7} publicações.</p>
          </div>

          {/* Modo de Distribuição */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Modo de Distribuição</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="bg-white/[0.03] border-white/10 text-white font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                <SelectItem value="UNIFORME">UNIFORME (Espaçamento fixo)</SelectItem>
                <SelectItem value="INTELIGENTE">INTELIGENTE / GROWTH AUTO (Picos de tráfego)</SelectItem>
                <SelectItem value="PERSONALIZADO">PERSONALIZADO (Janela estrita)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              {mode === "INTELIGENTE" ? "A IA escolhe os picos com maior CTR e engagement." : "Distribui de forma linear durante o dia."}
            </p>
          </div>

          {/* Janela Horária */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Janela de Horário</label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} placeholder="08:00" className="bg-white/[0.03] border-white/10 text-white text-center font-mono" />
              <Input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} placeholder="22:00" className="bg-white/[0.03] border-white/10 text-white text-center font-mono" />
            </div>
            <p className="text-xs text-slate-400">Início e fim das publicações diárias.</p>
          </div>
        </div>

        {/* Anti-Canibalização */}
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">Proteção Anti-Canibalização Ativa</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Impede o mesmo produto em slots consecutivos, saturação de ganchos repetidos e conflito entre variantes de testes A/B.
              </p>
            </div>
          </div>
          <Switch checked={antiCannibalization} onCheckedChange={setAntiCannibalization} />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold px-6">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Guardar Configuração
          </Button>
        </div>
      </div>
    </div>
  );
};
