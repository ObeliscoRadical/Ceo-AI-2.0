import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Layers, Plus, Sparkles, Loader2, Target, Calendar, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, Activity, Percent, Flame } from "lucide-react";
import { toast } from "sonner";

const WIZARD_STEPS = [
  { step: 1, title: "Produto", desc: "Seleção do produto da Vitrine" },
  { step: 2, title: "Objetivo", desc: "Meta da campanha" },
  { step: 3, title: "Público & Mercado", desc: "Audiência e região" },
  { step: 4, title: "Oferta", desc: "Proposta e transformação" },
  { step: 5, title: "CTA", desc: "Chamada para ação principal" },
  { step: 6, title: "Canais", desc: "Redes e formatos" },
  { step: 7, title: "Estratégia", desc: "Metodologia de conteúdo" },
  { step: 8, title: "Volume", desc: "Meta de peças a produzir" },
  { step: 9, title: "Frequência & Peso", desc: "Distribuição e prioridade" },
  { step: 10, title: "Preview", desc: "Revisão e simulação" },
  { step: 11, title: "Ativar", desc: "Lançamento no Content Pool" }
];

export const CampaignsWizardSection = ({ campaigns = [], products = [], onRefresh, onOpenStudioWithCampaign, api }) => {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [objective, setObjective] = useState("leads");
  const [targetAudience, setTargetAudience] = useState("");
  const [marketRegion, setMarketRegion] = useState("PT");
  const [language, setLanguage] = useState("pt");
  const [offer, setOffer] = useState("");
  const [cta, setCta] = useState("");
  const [channels, setChannels] = useState(["Instagram", "Facebook"]);
  const [strategy, setStrategy] = useState("Educativo");
  const [targetVolume, setTargetVolume] = useState(14);
  const [dailyFrequency, setDailyFrequency] = useState(2);
  const [priority, setPriority] = useState("normal");
  const [weightPercentage, setWeightPercentage] = useState(50);
  const [budget, setBudget] = useState(0);
  const [notes, setNotes] = useState("");

  const openWizard = (preselectedProduct = null) => {
    setCurrentStep(1);
    const p = preselectedProduct || products[0] || null;
    if (p) {
      setProductId(p.id);
      setName(`Campanha · ${p.name}`);
      setTargetAudience(p.target_audience || "");
      setOffer(p.offer || "");
      setCta(p.cta || "Pedir Orçamento");
    } else {
      setProductId("");
      setName("");
      setTargetAudience("");
      setOffer("");
      setCta("Pedir Orçamento");
    }
    setObjective("leads");
    setStrategy("Educativo");
    setTargetVolume(14);
    setDailyFrequency(2);
    setPriority("normal");
    setWeightPercentage(50);
    setBudget(0);
    setNotes("");
    setWizardOpen(true);
  };

  const handleProductSelect = (pid) => {
    setProductId(pid);
    const p = products.find(item => item.id === pid);
    if (p) {
      if (!name) setName(`Campanha · ${p.name}`);
      if (!targetAudience) setTargetAudience(p.target_audience || "");
      if (!offer) setOffer(p.offer || "");
      if (!cta) setCta(p.cta || "");
    }
  };

  const handleAiStepSuggestion = async () => {
    setLoadingAi(true);
    try {
      const res = await api.post("/marketing/campaigns/wizard-step", {
        step: currentStep,
        product_id: productId,
        objective,
        target_audience: targetAudience,
        offer,
        strategy
      });
      const sugg = res.data?.suggestions || {};
      if (sugg.suggested_title && currentStep <= 2) setName(sugg.suggested_title);
      if (sugg.suggested_audience && currentStep === 3) setTargetAudience(sugg.suggested_audience);
      if (sugg.suggested_offer && currentStep === 4) setOffer(sugg.suggested_offer);
      if (sugg.suggested_cta && currentStep === 5) setCta(sugg.suggested_cta);
      if (sugg.suggested_strategy && currentStep === 7) setStrategy(sugg.suggested_strategy);
      if (sugg.suggested_volume && currentStep === 8) setTargetVolume(sugg.suggested_volume);
      if (sugg.suggested_frequency && currentStep === 9) setDailyFrequency(sugg.suggested_frequency);
      toast.success("Sugestão da IA aplicada ao passo!");
    } catch (e) {
      toast.error("Erro ao obter sugestão da IA.");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleFinishWizard = async () => {
    if (!name.trim()) {
      toast.error("Defina o nome da campanha.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        product_id: productId || null,
        objective,
        target_audience: targetAudience,
        market_region: marketRegion,
        language,
        offer,
        cta,
        channels,
        strategy,
        target_volume: parseInt(targetVolume) || 14,
        daily_frequency: parseInt(dailyFrequency) || 2,
        priority,
        weight_percentage: parseInt(weightPercentage) || 50,
        budget: parseFloat(budget) || 0,
        status: "active",
        notes
      };

      const res = await api.post("/marketing/campaigns", payload);
      toast.success("🚀 Campanha criada e ativada com sucesso!");
      setWizardOpen(false);
      onRefresh();
      if (res.data?.campaign?.id) {
        onOpenStudioWithCampaign(res.data.campaign);
      }
    } catch (e) {
      toast.error("Erro ao criar campanha.");
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find(p => p.id === productId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Gestor de Campanhas (Wizard 11-Passos)</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Campanhas comerciais com alocação de pesos, metas de volume, estratégias e geração guiada passo a passo.
          </p>
        </div>
        <Button onClick={() => openWizard()} className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-lg shadow-purple-500/20">
          <Plus className="w-4 h-4 mr-2" /> Criar Campanha com Wizard
        </Button>
      </div>

      {/* Grid de Campanhas */}
      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-white">Nenhuma campanha ativa</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
            Inicie a sua primeira campanha guiada por IA para começar a alimentar o Content Pool e o Scheduler.
          </p>
          <Button onClick={() => openWizard()} variant="outline" className="mt-6 rounded-xl border-white/10 text-white hover:bg-white/5">
            <Sparkles className="w-4 h-4 mr-2 text-purple-400" /> Iniciar Wizard de 11 Passos
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-5 flex flex-col justify-between hover:border-purple-500/30 transition-all duration-300 shadow-lg">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    {c.objective || "leads"}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                    <Percent className="w-3.5 h-3.5" /> Peso: {c.weight_percentage || 50}%
                  </div>
                </div>

                <h3 className="text-base font-bold text-white">{c.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  <strong>Produto:</strong> {c.product_name || "Geral da Empresa"}
                </p>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] bg-white/[0.03] px-2 py-0.5 rounded text-slate-300 border border-white/5">
                    Estratégia: {c.strategy || "Educativo"}
                  </span>
                  <span className="text-[11px] bg-white/[0.03] px-2 py-0.5 rounded text-slate-300 border border-white/5">
                    {c.daily_frequency || 2} posts/dia
                  </span>
                </div>

                {c.offer && (
                  <p className="text-xs text-emerald-400/90 mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 line-clamp-2">
                    <strong>Oferta:</strong> {c.offer}
                  </p>
                )}

                {/* Barra de Progresso de Conteúdo */}
                <div className="mt-4 pt-3 border-t border-white/5">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>Estoque no Pool: {c.pool_count || 0}</span>
                    <span>Meta: {c.target_volume || 14} peças</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(((c.pool_count || 0) / Math.max(1, c.target_volume || 14)) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-white/5">
                <span className="text-xs text-slate-400">
                  Publicados: <strong className="text-white">{c.published_count || 0}</strong>
                </span>
                <Button size="sm" onClick={() => onOpenStudioWithCampaign(c)} className="h-8 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-xs font-medium border border-purple-500/30">
                  Abrir no Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Wizard de 11 Passos */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-3xl bg-[#0B0F17] border-white/10 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  Wizard de Campanhas · Passo {currentStep} de 11
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">{WIZARD_STEPS[currentStep - 1]?.desc}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleAiStepSuggestion} disabled={loadingAi} className="rounded-xl border-purple-500/30 text-purple-300 hover:bg-purple-500/10 text-xs">
                {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-purple-400" />}
                IA Sugerir Passo
              </Button>
            </div>
          </DialogHeader>

          {/* Stepper Progress Bar */}
          <div className="grid grid-cols-11 gap-1 py-2">
            {WIZARD_STEPS.map((s) => (
              <div
                key={s.step}
                onClick={() => setCurrentStep(s.step)}
                className={`h-1.5 rounded-full cursor-pointer transition-all ${
                  s.step === currentStep
                    ? "bg-purple-500 ring-2 ring-purple-400/40"
                    : s.step < currentStep
                    ? "bg-emerald-500"
                    : "bg-white/10"
                }`}
                title={`Passo ${s.step}: ${s.title}`}
              />
            ))}
          </div>

          {/* Conteúdo Dinâmico por Passo */}
          <div className="py-4 space-y-4 min-h-[260px]">
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">1. Selecione o Produto ou Serviço da Vitrine</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleProductSelect(p.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        productId === p.id
                          ? "border-purple-500 bg-purple-500/10 text-white"
                          : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-semibold uppercase text-purple-400">{p.category}</span>
                        <span className="text-xs font-bold text-white">{p.price ? `${p.price} €` : "Sob Consulta"}</span>
                      </div>
                      <p className="text-sm font-bold mt-1">{p.name}</p>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">{p.value_prop || p.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">2. Qual é o Objetivo Principal da Campanha?</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {[
                    { id: "leads", label: "Geração de Leads", desc: "Contactos e orçamentos" },
                    { id: "awareness", label: "Awareness & Alcance", desc: "Visibilidade de marca" },
                    { id: "vendas", label: "Vendas Diretas", desc: "Conversão imediata" },
                    { id: "autoridade", label: "Autoridade", desc: "Posicionamento de especialista" },
                    { id: "reativacao", label: "Reativação", desc: "Clientes antigos" },
                    { id: "lancamento", label: "Lançamento", desc: "Novo produto" },
                  ].map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setObjective(o.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        objective === o.id
                          ? "border-purple-500 bg-purple-500/10 text-white"
                          : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <p className="text-sm font-bold">{o.label}</p>
                      <p className="text-xs text-slate-400 mt-1">{o.desc}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-400">Nome da Campanha</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Campanha Outono · Leads Industriais" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">3. Definição de Público e Mercado</h3>
                <div>
                  <label className="text-xs text-slate-400">Público-Alvo Específico</label>
                  <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Ex.: Diretores de operações e gestores de manutenção" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400">País / Região</label>
                    <Input value={marketRegion} onChange={(e) => setMarketRegion(e.target.value)} placeholder="PT" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Idioma</label>
                    <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">4. Oferta Comercial & Promessa</h3>
                <div>
                  <label className="text-xs text-slate-400">Oferta / Gancho Irresistível</label>
                  <Textarea value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Ex.: Auditoria de eficiência energética gratuita + proposta em 48h sem compromisso." className="mt-1 bg-white/[0.03] border-white/10 text-white min-h-[90px]" />
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">5. Chamada para Ação (CTA) Principal</h3>
                <div>
                  <label className="text-xs text-slate-400">Texto do CTA</label>
                  <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex.: Envie mensagem privada com 'DIAGNÓSTICO' ou agende no link." className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">6. Canais de Distribuição</h3>
                <div className="grid grid-cols-3 gap-3">
                  {["Instagram", "Facebook", "LinkedIn", "TikTok", "Blog", "Email"].map((ch) => (
                    <div
                      key={ch}
                      onClick={() => {
                        if (channels.includes(ch)) setChannels(channels.filter(item => item !== ch));
                        else setChannels([...channels, ch]);
                      }}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                        channels.includes(ch)
                          ? "border-purple-500 bg-purple-500/10 text-white font-bold"
                          : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      {ch}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">7. Estratégia de Conteúdo</h3>
                <div className="grid grid-cols-3 gap-3">
                  {["Educativo", "Autoridade", "Produto", "Demonstração", "UGC", "Storytelling", "Trend Adaptation", "CTA Direto", "Original"].map((st) => (
                    <div
                      key={st}
                      onClick={() => setStrategy(st)}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                        strategy === st
                          ? "border-purple-500 bg-purple-500/10 text-white font-bold"
                          : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      {st}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 8 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">8. Volume de Conteúdo Alvo</h3>
                <div>
                  <label className="text-xs text-slate-400">Meta de peças a produzir para esta campanha</label>
                  <Input type="number" value={targetVolume} onChange={(e) => setTargetVolume(e.target.value)} className="mt-1 bg-white/[0.03] border-white/10 text-white" />
                  <p className="text-xs text-slate-400 mt-2">Recomendado para início de ciclo: 14 a 30 peças.</p>
                </div>
              </div>
            )}

            {currentStep === 9 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">9. Frequência Diária e Peso na Grade</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400">Posts por Dia desta Campanha</label>
                    <Select value={String(dailyFrequency)} onValueChange={(v) => setDailyFrequency(Number(v))}>
                      <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                        {[1, 2, 3, 4, 6, 8, 12].map((f) => (
                          <SelectItem key={f} value={String(f)}>{f} post(s)/dia</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Peso Percentual na Grade ({weightPercentage}%)</label>
                    <Input type="range" min="10" max="100" step="5" value={weightPercentage} onChange={(e) => setWeightPercentage(e.target.value)} className="mt-2" />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 10 && (
              <div className="space-y-3 bg-white/[0.02] p-4 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold text-purple-400">10. Resumo & Simulação de Lançamento</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">Campanha:</span> <strong className="text-white">{name}</strong></div>
                  <div><span className="text-slate-400">Produto:</span> <strong className="text-white">{selectedProduct?.name || "Geral"}</strong></div>
                  <div><span className="text-slate-400">Objetivo:</span> <strong className="text-white">{objective}</strong></div>
                  <div><span className="text-slate-400">Estratégia:</span> <strong className="text-white">{strategy}</strong></div>
                  <div><span className="text-slate-400">Frequência:</span> <strong className="text-white">{dailyFrequency} posts/dia</strong></div>
                  <div><span className="text-slate-400">Volume Alvo:</span> <strong className="text-white">{targetVolume} peças</strong></div>
                </div>
                {offer && (
                  <p className="text-xs text-emerald-400 mt-2"><strong>Oferta:</strong> {offer}</p>
                )}
              </div>
            )}

            {currentStep === 11 && (
              <div className="space-y-4 text-center py-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Tudo Pronto para Ativar a Campanha!</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Ao ativar, a campanha será registada e ficará disponível no Studio para criação instantânea de posts com este contexto comercial.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between items-center border-t border-white/10 pt-3">
            <div>
              {currentStep > 1 && (
                <Button type="button" variant="ghost" onClick={() => setCurrentStep(currentStep - 1)} className="text-slate-400 hover:text-white rounded-xl">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setWizardOpen(false)} className="text-slate-400 hover:text-white rounded-xl">
                Cancelar
              </Button>
              {currentStep < 11 ? (
                <Button type="button" onClick={() => setCurrentStep(currentStep + 1)} className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl">
                  Próximo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={handleFinishWizard} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Ativar & Abrir Studio
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
