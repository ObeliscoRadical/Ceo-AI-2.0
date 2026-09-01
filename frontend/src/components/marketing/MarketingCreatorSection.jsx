import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainCircuit, Sparkles, Loader2, Target, Lightbulb, ShieldAlert, ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const MarketingCreatorSection = ({ products = [], campaigns = [], onSendIdeaToStudio, api }) => {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [objective, setObjective] = useState("leads");
  const [strategy, setStrategy] = useState("Educativo");
  const [customNotes, setCustomNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [strategyResult, setStrategyResult] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/marketing/creator/generate-strategy", {
        product_id: productId || null,
        campaign_id: campaignId || null,
        objective,
        strategy,
        custom_notes: customNotes
      });
      setStrategyResult(res.data?.strategy || null);
      toast.success("Matriz Estratégica gerada com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar estratégia.");
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    toast.success("Copiado!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Criador de Marketing Estratégico</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Gera posicionamento, ângulos de ataque, quebra de objeções, ganchos de alta conversão e ideias de conteúdo.
          </p>
        </div>
      </div>

      {/* Inputs de Contexto */}
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 font-medium">Produto / Serviço</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                <SelectItem value="none">Nenhum (Geral da Empresa)</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Campanha</label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                <SelectValue placeholder="Escolha a campanha" />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                <SelectItem value="none">Nenhuma (Geral)</SelectItem>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Objetivo</label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                {["leads", "awareness", "vendas", "autoridade", "reativacao", "lancamento"].map(o => (
                  <SelectItem key={o} value={o}>{o.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Estratégia Principal</label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                {["Educativo", "Autoridade", "Produto", "Demonstração", "UGC", "Storytelling", "Trend Adaptation", "CTA Direto", "Original"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 font-medium">Notas de Contexto ou Ângulo Específico (Opcional)</label>
          <Input value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} placeholder="Ex.: Focar na redução de custos no inverno e na rapidez da equipa técnica" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={generating} className="rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 shadow-lg shadow-amber-500/20">
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Gerar Matriz Estratégica 360°
          </Button>
        </div>
      </div>

      {/* Resultados da Estratégia */}
      {strategyResult && (
        <div className="space-y-6">
          {/* Posicionamento e Mensagem Central */}
          <div className="p-5 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Declaração de Posicionamento Central</span>
            <p className="text-base font-bold text-white mt-1">{strategyResult.positioning_statement}</p>
            <p className="text-xs text-slate-300 mt-2"><strong>Mensagem Central:</strong> {strategyResult.core_message}</p>
          </div>

          {/* Ângulos de Ataque */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" /> Ângulos Estratégicos
            </h3>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(strategyResult.angles || []).map((ang, i) => (
                <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                  <p className="text-sm font-bold text-white">{ang.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{ang.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ganchos / Hooks de Alta Conversão */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> Ganchos Magnéticos (Hooks)
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {(strategyResult.high_converting_hooks || []).map((hk, i) => (
                <div key={i} className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-purple-400">{hk.type}</span>
                    <p className="text-xs font-semibold text-white mt-0.5">"{hk.hook}"</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyText(hk.hook, `hook-${i}`)} className="h-8 w-8 p-0 text-slate-400 hover:text-white shrink-0">
                    {copiedIndex === `hook-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Matriz de Objeções */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Matriz de Objeções & Respostas
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              {(strategyResult.objections_matrix || []).map((obj, i) => (
                <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                  <p className="text-xs font-bold text-rose-300">Objeção: "{obj.objection}"</p>
                  <p className="text-xs text-emerald-300 mt-2"><strong>Resposta:</strong> {obj.reframing}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ideias Prontas para o Studio */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-400" /> Ideias de Conteúdo Prontas para o Studio
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {(strategyResult.content_ideas || []).map((idea, i) => (
                <div key={i} className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400">{idea.format} · {idea.angle}</span>
                    <p className="text-sm font-bold text-white mt-0.5">{idea.title}</p>
                  </div>
                  <Button size="sm" onClick={() => onSendIdeaToStudio(idea, productId, campaignId, strategy, objective)} className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shrink-0">
                    Criar no Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
