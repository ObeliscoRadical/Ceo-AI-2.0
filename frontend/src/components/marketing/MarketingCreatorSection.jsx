import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BrainCircuit,
  Sparkles,
  Loader2,
  Target,
  Lightbulb,
  ShieldAlert,
  ArrowRight,
  Copy,
  Check,
  Zap,
  CheckCircle2,
  Layers,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  Send,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export const MarketingCreatorSection = ({
  products = [],
  campaigns = [],
  onSendIdeaToStudio,
  onBatchApproveSuccess,
  api
}) => {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [objective, setObjective] = useState("leads");
  const [strategy, setStrategy] = useState("Educativo");
  const [customNotes, setCustomNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [strategyResult, setStrategyResult] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Batch Creation & Approval State
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchPosts, setBatchPosts] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchApproving, setBatchApproving] = useState(false);
  const [activeSlideIndices, setActiveSlideIndices] = useState({});
  const [generatingImageIdx, setGeneratingImageIdx] = useState(null);

  // Restaurar batchPosts salvos no localStorage ao carregar
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ceo_ai_creator_batch_posts");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBatchPosts(parsed);
          setSelectedIndices(new Set(parsed.map((_, i) => i)));
          setShowBatchModal(true);
        }
      }
    } catch (e) {}
  }, []);

  // Persistir batchPosts sempre que for atualizado
  useEffect(() => {
    if (batchPosts && batchPosts.length > 0) {
      try {
        localStorage.setItem("ceo_ai_creator_batch_posts", JSON.stringify(batchPosts));
      } catch (e) {}
    }
  }, [batchPosts]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/marketing/creator/generate-strategy", {
        product_id: productId !== "none" ? productId : null,
        campaign_id: campaignId !== "none" ? campaignId : null,
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

  // Batch Creation of all suggested content ideas
  const handleBatchCreateAll = async () => {
    const ideas = strategyResult?.content_ideas || [];
    if (ideas.length === 0) {
      toast.error("Nenhuma ideia de conteúdo disponível na estratégia.");
      return;
    }

    setBatchCreating(true);
    try {
      const res = await api.post("/marketing/creator/batch-create-posts", {
        product_id: productId !== "none" ? productId : null,
        campaign_id: campaignId !== "none" ? campaignId : null,
        objective,
        strategy,
        content_ideas: ideas,
        network: "Instagram"
      });

      const posts = res.data?.posts || [];
      if (posts.length === 0) {
        toast.error("Não foi possível gerar os posts.");
        return;
      }

      setBatchPosts(posts);
      // Select all by default
      const allSelected = new Set(posts.map((_, i) => i));
      setSelectedIndices(allSelected);
      setShowBatchModal(true);
      toast.success(`⚡ ${posts.length} criativos gerados com copy, ganchos e imagens com sucesso!`);
    } catch (e) {
      toast.error("Erro ao gerar criativos em lote.");
    } finally {
      setBatchCreating(false);
    }
  };

  const toggleSelectPost = (idx) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === batchPosts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(batchPosts.map((_, i) => i)));
    }
  };

  const updateBatchPostField = (idx, field, value) => {
    setBatchPosts((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const setSlideIndexForPost = (postIdx, slideIdx) => {
    setActiveSlideIndices((prev) => ({
      ...prev,
      [postIdx]: slideIdx
    }));
  };

  const handleGenerateIndividualImage = async (idx) => {
    const post = batchPosts[idx];
    if (!post) return;
    setGeneratingImageIdx(idx);
    try {
      const selectedProd = products.find((p) => p.id === productId);
      const res = await api.post("/marketing/studio/generate-image", {
        hook: post.hook || "",
        title: post.title || "",
        caption: post.caption || "",
        visual_briefing: post.visual_briefing || "",
        product_name: selectedProd?.name || "",
      });
      if (res.data?.image_url) {
        const newUrl = res.data.image_url;
        updateBatchPostField(idx, "image_url", newUrl);
        const currentVariants = post.image_variants || [];
        if (!currentVariants.includes(newUrl)) {
          updateBatchPostField(idx, "image_variants", [newUrl, ...currentVariants]);
        }
        toast.success(`Imagem gerada com sucesso para o Criativo #${idx + 1}!`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar imagem com IA.");
    } finally {
      setGeneratingImageIdx(null);
    }
  };

  // Batch Approve & Send to Content Pool
  const handleBatchApprove = async () => {
    const selectedPosts = batchPosts.filter((_, i) => selectedIndices.has(i));
    if (selectedPosts.length === 0) {
      toast.error("Selecione pelo menos um criativo para aprovar.");
      return;
    }

    setBatchApproving(true);
    try {
      const res = await api.post("/marketing/creator/batch-approve-to-pool", {
        posts: selectedPosts
      });

      toast.success(res.data?.message || `${selectedPosts.length} criativos aprovados e enviados para o Content Pool!`);
      setShowBatchModal(false);
      setBatchPosts([]);
      try {
        localStorage.removeItem("ceo_ai_creator_batch_posts");
      } catch (e) {}
      if (onBatchApproveSuccess) {
        onBatchApproveSuccess();
      }
    } catch (e) {
      toast.error("Erro ao aprovar criativos para o Content Pool.");
    } finally {
      setBatchApproving(false);
    }
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
            Gera posicionamento, ângulos de ataque, quebra de objeções, ganchos de alta conversão e ideias prontas para o Studio.
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
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
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
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
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
                {["leads", "awareness", "vendas", "autoridade", "reativacao", "lancamento"].map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.toUpperCase()}
                  </SelectItem>
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
                {["Educativo", "Autoridade", "Produto", "Demonstração", "UGC", "Storytelling", "Trend Adaptation", "CTA Direto", "Original"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 font-medium">Notas de Contexto ou Ângulo Específico (Opcional)</label>
          <Input
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="Ex.: Focar na redução de custos no inverno e na rapidez da equipa técnica"
            className="mt-1 bg-white/[0.03] border-white/10 text-white"
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 shadow-lg shadow-amber-500/20"
          >
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
            <p className="text-xs text-slate-300 mt-2">
              <strong>Mensagem Central:</strong> {strategyResult.core_message}
            </p>
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
                <div
                  key={i}
                  className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold text-purple-400">{hk.type}</span>
                    <p className="text-xs font-semibold text-white mt-0.5">"{hk.hook}"</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyText(hk.hook, `hook-${i}`)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-white shrink-0"
                  >
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
                  <p className="text-xs text-emerald-300 mt-2">
                    <strong>Resposta:</strong> {obj.reframing}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Ideias Prontas para o Studio & BOTÃO DE CRIAÇÃO AUTOMÁTICA EM LOTE */}
          <div className="space-y-4 pt-2">
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-blue-500/5 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Zap className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Ideias de Conteúdo Prontas para o Studio ({strategyResult.content_ideas?.length || 0} Sugestões)
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Pode criar peça a peça individualmente no Studio ou usar o botão automático para <strong>gerar copy, carrosséis e imagens para todas em simultâneo</strong>.
                </p>
              </div>

              <Button
                onClick={handleBatchCreateAll}
                disabled={batchCreating || !(strategyResult.content_ideas?.length)}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-5 py-2.5 shadow-lg shadow-emerald-500/25 shrink-0 flex items-center gap-2"
              >
                {batchCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>A Criar Todas as Peças com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>⚡ Criar Todas no Studio com IA ({strategyResult.content_ideas?.length || 0})</span>
                  </>
                )}
              </Button>
            </div>

            {/* Grid das Ideias Individuais */}
            <div className="grid md:grid-cols-2 gap-3">
              {(strategyResult.content_ideas || []).map((idea, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors"
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      {idea.format} · {idea.angle}
                    </span>
                    <p className="text-sm font-bold text-white mt-0.5">{idea.title}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onSendIdeaToStudio(idea, productId, campaignId, strategy, objective)}
                    className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shrink-0"
                  >
                    Criar no Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REVISÃO E APROVAÇÃO EM LOTE DOS CRIATIVOS GERADOS */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B0F17] border border-emerald-500/30 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 to-transparent">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Sparkles className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-bold text-white">
                    Revisão & Aprovação em Lote ({batchPosts.length} Criativos Prontos)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Reveja as copies, carrosséis e imagens geradas pela IA. Pode desmarcar as que não quiser e aprovar tudo de uma só vez para o Content Pool.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectAll}
                  className="rounded-xl border-white/10 text-xs text-slate-300 hover:bg-white/5"
                >
                  {selectedIndices.size === batchPosts.length ? "Desmarcar Todos" : "Selecionar Todos"}
                </Button>

                <button
                  onClick={() => setShowBatchModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content / Cards Deck */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid md:grid-cols-2 gap-6">
                {batchPosts.map((post, idx) => {
                  const isSelected = selectedIndices.has(idx);
                  const isCarousel = post.format === "Carrossel" || (post.carousel_slides && post.carousel_slides.length > 0);
                  const slides = post.carousel_slides || [];
                  const activeSlide = activeSlideIndices[idx] || 0;

                  return (
                    <div
                      key={idx}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-emerald-500/40 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/10"
                          : "border-white/10 bg-white/[0.01] opacity-70"
                      }`}
                    >
                      <div className="space-y-4">
                        {/* Top Bar of Card */}
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectPost(idx)}
                              className="w-4 h-4 rounded text-emerald-600 bg-white/5 border-white/20 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-white">
                              Criativo #{idx + 1}
                            </span>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {post.format}
                            </span>
                            <span className="text-[10px] text-slate-400">{post.angle}</span>
                          </div>

                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Pronto para Pool
                          </span>
                        </div>

                        {/* Image / Carousel Preview */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          {/* Image Box */}
                          <div className="sm:col-span-5 flex flex-col gap-2">
                            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-black/60 to-black/30 border border-white/10 aspect-square flex flex-col items-center justify-center p-2 group shadow-inner">
                              {generatingImageIdx === idx ? (
                                <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
                                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                                  <span className="text-[11px] font-bold text-emerald-300">A criar imagem com IA...</span>
                                  <span className="text-[9px] text-slate-400">Fidelidade total ao hook</span>
                                </div>
                              ) : post.image_url ? (
                                <div className="relative w-full h-full rounded-xl overflow-hidden group">
                                  <img src={post.image_url} alt="Cover" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleGenerateIndividualImage(idx)}
                                      disabled={generatingImageIdx === idx}
                                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold h-8 shadow-lg"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Nova Imagem
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center p-3 text-center space-y-2">
                                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400">
                                    <ImageIcon className="w-6 h-6 text-slate-500" />
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-medium">Sem imagem</p>
                                  <Button
                                    size="sm"
                                    onClick={() => handleGenerateIndividualImage(idx)}
                                    disabled={generatingImageIdx === idx}
                                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-bold h-8 shadow-md"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar Imagem
                                  </Button>
                                </div>
                              )}
                            </div>

                            {post.image_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleGenerateIndividualImage(idx)}
                                disabled={generatingImageIdx === idx}
                                className="w-full rounded-xl border-white/10 hover:border-emerald-500/40 text-slate-300 hover:text-white text-[11px] font-semibold h-7"
                              >
                                {generatingImageIdx === idx ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" /> A Gerar...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1 text-emerald-400" /> Trocar / Gerar Nova
                                  </>
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Text Brief & Carousel Slides Navigator */}
                          <div className="sm:col-span-7 space-y-2">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-slate-400">Título</label>
                              <Input
                                value={post.title || ""}
                                onChange={(e) => updateBatchPostField(idx, "title", e.target.value)}
                                className="h-8 text-xs bg-white/[0.03] border-white/10 text-white font-semibold"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold uppercase text-purple-400">Gancho (Hook)</label>
                              <Input
                                value={post.hook || ""}
                                onChange={(e) => updateBatchPostField(idx, "hook", e.target.value)}
                                className="h-8 text-xs bg-purple-500/5 border-purple-500/20 text-white font-medium"
                              />
                            </div>

                            {/* Carousel Specific Slides UI */}
                            {isCarousel && slides.length > 0 && (
                              <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-bold text-blue-300 flex items-center gap-1">
                                    <Layers className="w-3 h-3" /> Slide {activeSlide + 1} de {slides.length}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setSlideIndexForPost(idx, Math.max(0, activeSlide - 1))}
                                      disabled={activeSlide === 0}
                                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30"
                                    >
                                      <ChevronLeft className="w-3 h-3 text-white" />
                                    </button>
                                    <button
                                      onClick={() => setSlideIndexForPost(idx, Math.min(slides.length - 1, activeSlide + 1))}
                                      disabled={activeSlide === slides.length - 1}
                                      className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30"
                                    >
                                      <ChevronRight className="w-3 h-3 text-white" />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-[11px] font-bold text-white">
                                  {slides[activeSlide]?.title}
                                </p>
                                <p className="text-[10px] text-slate-300 line-clamp-2">
                                  {slides[activeSlide]?.content}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Caption & CTA */}
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Legenda / Copy Completa</label>
                          <Textarea
                            rows={3}
                            value={post.caption || ""}
                            onChange={(e) => updateBatchPostField(idx, "caption", e.target.value)}
                            className="text-xs bg-white/[0.03] border-white/10 text-slate-200"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-emerald-400">CTA</label>
                            <Input
                              value={post.cta || ""}
                              onChange={(e) => updateBatchPostField(idx, "cta", e.target.value)}
                              className="h-8 text-xs bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-blue-400">Hashtags</label>
                            <Input
                              value={(post.hashtags || []).join(" ")}
                              onChange={(e) => updateBatchPostField(idx, "hashtags", e.target.value.split(" "))}
                              className="h-8 text-xs bg-blue-500/5 border-blue-500/20 text-blue-300"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowBatchModal(false);
                            onSendIdeaToStudio(post, productId, campaignId, strategy, objective);
                          }}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                          Editar Detalhado no Studio
                        </Button>

                        <button
                          onClick={() => toggleSelectPost(idx)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            isSelected
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              : "bg-white/5 text-slate-400 border-white/10"
                          }`}
                        >
                          {isSelected ? "✓ Selecionado" : "+ Incluir no Lote"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="p-6 border-t border-white/10 bg-[#070A0F] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-semibold text-white">
                  {selectedIndices.size} de {batchPosts.length} criativos selecionados para o Content Pool
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setShowBatchModal(false)}
                  className="rounded-xl border-white/10 text-white hover:bg-white/5 w-full sm:w-auto"
                >
                  Cancelar
                </Button>

                <Button
                  onClick={handleBatchApprove}
                  disabled={batchApproving || selectedIndices.size === 0}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold px-6 py-2.5 shadow-lg shadow-emerald-500/25 w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  {batchApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>A Enviar para Content Pool...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>🚀 Aprovar & Enviar ({selectedIndices.size}) para Content Pool</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
