import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Sparkles, Loader2, Send, Save, RefreshCw, Copy, Check, Split, Image as ImageIcon, CheckCircle2, Instagram, Facebook, Tag } from "lucide-react";
import { toast } from "sonner";

export const StudioSection = ({ products = [], campaigns = [], initialPost = null, onSendToPoolSuccess, api }) => {
  const [productId, setProductId] = useState(initialPost?.product_id || products[0]?.id || "");
  const [campaignId, setCampaignId] = useState(initialPost?.campaign_id || campaigns[0]?.id || "");
  const [format, setFormat] = useState(initialPost?.format || "Post");
  const [network, setNetwork] = useState(initialPost?.network || "Instagram");
  const [strategy, setStrategy] = useState(initialPost?.strategy || "Educativo");
  const [goal, setGoal] = useState(initialPost?.goal || "leads");
  const [idea, setIdea] = useState(initialPost?.title || "");

  // Post Generated Fields
  const [title, setTitle] = useState(initialPost?.title || "");
  const [hook, setHook] = useState(initialPost?.hook || "");
  const [caption, setCaption] = useState(initialPost?.caption || "");
  const [cta, setCta] = useState(initialPost?.cta || "");
  const [hashtags, setHashtags] = useState((initialPost?.hashtags || []).join(" "));
  const [visualBriefing, setVisualBriefing] = useState(initialPost?.visual_briefing || "");
  const [imageUrl, setImageUrl] = useState(initialPost?.image_url || null);
  const [imageVariants, setImageVariants] = useState(initialPost?.image_variants || []);
  const [carouselSlides, setCarouselSlides] = useState(initialPost?.carousel_slides || []);
  const [activeSlide, setActiveSlide] = useState(0);
  const [variantType, setVariantType] = useState("A");

  // Variant B
  const [variantB, setVariantB] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [savingPool, setSavingPool] = useState(false);

  useEffect(() => {
    if (initialPost) {
      if (initialPost.product_id) setProductId(initialPost.product_id);
      if (initialPost.campaign_id) setCampaignId(initialPost.campaign_id);
      if (initialPost.format) setFormat(initialPost.format);
      if (initialPost.title) setTitle(initialPost.title);
      if (initialPost.hook) setHook(initialPost.hook);
      if (initialPost.caption) setCaption(initialPost.caption);
      if (initialPost.cta) setCta(initialPost.cta);
      if (initialPost.hashtags) setHashtags(Array.isArray(initialPost.hashtags) ? initialPost.hashtags.join(" ") : initialPost.hashtags);
      if (initialPost.visual_briefing) setVisualBriefing(initialPost.visual_briefing);
      if (initialPost.image_url) setImageUrl(initialPost.image_url);
      if (initialPost.image_variants) setImageVariants(initialPost.image_variants);
      if (initialPost.carousel_slides) setCarouselSlides(initialPost.carousel_slides);
    } else {
      try {
        const saved = localStorage.getItem("ceo_ai_studio_draft");
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.title) setTitle(draft.title);
          if (draft.hook) setHook(draft.hook);
          if (draft.caption) setCaption(draft.caption);
          if (draft.cta) setCta(draft.cta);
          if (draft.hashtags) setHashtags(draft.hashtags);
          if (draft.visual_briefing) setVisualBriefing(draft.visual_briefing);
          if (draft.image_url) setImageUrl(draft.image_url);
          if (draft.image_variants) setImageVariants(draft.image_variants);
          if (draft.format) setFormat(draft.format);
          if (draft.product_id) setProductId(draft.product_id);
          if (draft.campaign_id) setCampaignId(draft.campaign_id);
        }
      } catch (e) {
        console.warn("Erro ao restaurar rascunho do Studio:", e);
      }
    }
  }, [initialPost]);

  // Persistir rascunho sempre que mudar para nunca perder imagens ou textos ao atualizar a página
  useEffect(() => {
    if (title || hook || caption || imageUrl) {
      try {
        localStorage.setItem("ceo_ai_studio_draft", JSON.stringify({
          title, hook, caption, cta, hashtags, visual_briefing: visualBriefing,
          image_url: imageUrl, image_variants: imageVariants,
          format, product_id: productId, campaign_id: campaignId
        }));
      } catch (e) {}
    }
  }, [title, hook, caption, cta, hashtags, visualBriefing, imageUrl, imageVariants, format, productId, campaignId]);

  const handleGeneratePost = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/marketing/studio/generate-post", {
        product_id: productId || null,
        campaign_id: campaignId || null,
        format,
        network,
        strategy,
        goal,
        idea,
        generate_image: true
      });
      const p = res.data?.post || {};
      setTitle(p.title || "");
      setHook(p.hook || "");
      setCaption(p.caption || "");
      setCta(p.cta || "");
      setHashtags((p.hashtags || []).join(" "));
      setVisualBriefing(p.visual_briefing || "");
      setImageUrl(p.image_url || null);
      setImageVariants(p.image_variants || []);
      setCarouselSlides(p.carousel_slides || []);
      setVariantB(null);
      toast.success("Post e Imagens gerados pelo Studio com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar post no Studio.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateImageOnly = async () => {
    setGeneratingImage(true);
    try {
      const res = await api.post("/marketing/studio/generate-image", {
        prompt: visualBriefing || `${title || idea || "business commercial"} professional photography 1k`,
        title: title || idea,
        format
      });
      if (res.data?.image_url) {
        setImageUrl(res.data.image_url);
        setImageVariants(prev => [res.data.image_url, ...(prev || [])]);
        toast.success("Nova imagem gerada pela IA!");
      }
    } catch (e) {
      toast.error("Erro ao gerar imagem.");
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleGenerateVariants = async () => {
    if (!title.trim() && !caption.trim()) {
      toast.error("Gere ou preencha o post original primeiro.");
      return;
    }
    setGeneratingVariants(true);
    try {
      const res = await api.post("/marketing/studio/generate-variants", {
        post: { title, hook, caption, cta, format }
      });
      setVariantB(res.data?.variants?.variant_b || null);
      toast.success("Variante B de teste gerada com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar variante B.");
    } finally {
      setGeneratingVariants(false);
    }
  };

  const handleSendToPool = async (isVariantB = false) => {
    const postToSend = isVariantB && variantB ? variantB : { title, hook, caption, cta };
    if (!postToSend.title && !postToSend.caption) {
      toast.error("Preencha o conteúdo antes de enviar.");
      return;
    }
    setSavingPool(true);
    try {
      const payload = {
        product_id: productId || null,
        campaign_id: campaignId || null,
        title: postToSend.title,
        format,
        network,
        strategy,
        goal,
        hook: postToSend.hook,
        caption: postToSend.caption,
        cta: postToSend.cta,
        hashtags: hashtags.split(" ").filter(h => h.trim().startsWith("#")),
        visual_briefing: visualBriefing,
        carousel_slides: carouselSlides,
        image_url: imageUrl,
        image_variants: imageVariants,
        variant_type: isVariantB ? "B" : "A",
        status: "READY"
      };
      await api.post("/marketing/studio/send-to-pool", payload);
      toast.success(`Post (${isVariantB ? "Variante B" : "Variante A"}) enviado para o Content Pool como READY!`);
      if (onSendToPoolSuccess) onSendToPoolSuccess();
    } catch (e) {
      toast.error("Erro ao enviar para o Content Pool.");
    } finally {
      setSavingPool(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Palette className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Studio de Conteúdo & Novo Post</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Criação multimodal vinculada estritamente ao Produto e à Campanha. Sem posts soltos.
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        {/* Painel de Configuração e Edição */}
        <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium">Produto / Oferta *</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue placeholder="Escolha o produto" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Campanha *</label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue placeholder="Escolha a campanha" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  <SelectItem value="none">Geral da Empresa</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Formato</label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  {["Post", "Story", "Reel", "Artigo", "Carrossel", "Short Video"].map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium">Rede Social</label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  {["Instagram", "Facebook", "LinkedIn", "TikTok", "Blog"].map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Estratégia</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  {["Educativo", "Autoridade", "Produto", "Demonstração", "UGC", "Storytelling", "Trend Adaptation", "CTA Direto"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Objetivo</label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                  {["leads", "awareness", "vendas", "autoridade", "reativacao"].map(g => (
                    <SelectItem key={g} value={g}>{g.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium">Ideia Base / Tema da Peça</label>
            <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ex.: Mostrar como a instalação correta evita acidentes e poupa energia" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button onClick={handleGeneratePost} disabled={generating} className="rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold shadow-lg shadow-pink-500/20">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Gerar Conteúdo com IA
            </Button>
            <Button onClick={handleGenerateVariants} disabled={generatingVariants || !caption} variant="outline" className="rounded-xl border-purple-500/30 text-purple-300 hover:bg-purple-500/10">
              {generatingVariants ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Split className="w-3.5 h-3.5 mr-1.5" />}
              Gerar Variante B (A/B)
            </Button>
          </div>

          {/* Editor dos Campos Gerados */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <div>
              <label className="text-xs text-slate-400 font-medium">Título da Peça</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 bg-white/[0.03] border-white/10 text-white font-semibold" />
            </div>

            <div>
              <label className="text-xs text-purple-400 font-bold">Gancho de Abertura (Hook)</label>
              <Input value={hook} onChange={(e) => setHook(e.target.value)} className="mt-1 bg-purple-500/5 border-purple-500/20 text-white" />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Legenda / Roteiro Completo</label>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="mt-1 bg-white/[0.03] border-white/10 text-white min-h-[140px]" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-emerald-400 font-medium">Chamada para Ação (CTA)</label>
                <Input value={cta} onChange={(e) => setCta(e.target.value)} className="mt-1 bg-emerald-500/5 border-emerald-500/20 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Hashtags</label>
                <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Preview do Post e Imagem */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-white/10 bg-[#0B0F17] flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  {network === "Instagram" ? <Instagram className="w-4 h-4 text-pink-400" /> : <Facebook className="w-4 h-4 text-blue-400" />}
                  <span className="text-xs font-bold text-white">{network} · {format} (Variante A)</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Pronto para Pool
                </span>
              </div>

              {/* Preview de Imagem */}
              <div className="mt-3 relative rounded-xl overflow-hidden bg-black/40 border border-white/10 aspect-square flex flex-col items-center justify-center group">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                      <Button
                        size="sm"
                        onClick={handleGenerateImageOnly}
                        disabled={generatingImage}
                        className="rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow-lg"
                      >
                        {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                        Gerar Nova Imagem com IA
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-4 space-y-3">
                    <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">Nenhuma imagem selecionada ainda.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateImageOnly}
                      disabled={generatingImage}
                      className="rounded-xl border-pink-500/30 text-pink-300 hover:bg-pink-500/10 text-xs font-semibold"
                    >
                      {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                      Gerar Imagem com IA
                    </Button>
                  </div>
                )}
              </div>

              {/* Seletor de Variantes de Imagem */}
              {imageVariants.length > 1 && (
                <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Variantes:</span>
                  {imageVariants.map((vUrl, vIdx) => (
                    <div
                      key={vIdx}
                      onClick={() => setImageUrl(vUrl)}
                      className={`w-10 h-10 rounded-lg overflow-hidden border cursor-pointer transition-all shrink-0 ${
                        imageUrl === vUrl ? "border-pink-500 ring-2 ring-pink-500/50" : "border-white/10 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={vUrl} alt={`Var ${vIdx + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}

              {/* Carousel Slides Preview se formato for Carrossel */}
              {format === "Carrossel" && carouselSlides.length > 0 && (
                <div className="mt-3 p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-300">
                      Slide {activeSlide + 1} de {carouselSlides.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveSlide((prev) => Math.max(0, prev - 1))}
                        disabled={activeSlide === 0}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30"
                      >
                        ← Anterior
                      </button>
                      <button
                        onClick={() => setActiveSlide((prev) => Math.min(carouselSlides.length - 1, prev + 1))}
                        disabled={activeSlide === carouselSlides.length - 1}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30"
                      >
                        Próximo →
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
                    <p className="text-xs font-bold text-white">{carouselSlides[activeSlide]?.title}</p>
                    <p className="text-xs text-slate-300 mt-1 whitespace-pre-line">{carouselSlides[activeSlide]?.content}</p>
                  </div>
                </div>
              )}

              {/* Texto do Post */}
              <div className="mt-3 space-y-2 text-xs">
                {hook && <p className="font-bold text-white">"{hook}"</p>}
                <p className="text-slate-300 line-clamp-4 whitespace-pre-line">{caption || "A legenda gerada aparecerá aqui..."}</p>
                {cta && <p className="font-semibold text-emerald-400">{cta}</p>}
                {hashtags && <p className="text-blue-400">{hashtags}</p>}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-between gap-2">
              <Button onClick={() => handleSendToPool(false)} disabled={savingPool || !title} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                {savingPool ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Aprovar & Enviar para Content Pool
              </Button>
            </div>
          </div>

          {/* Preview da Variante B se existir */}
          {variantB && (
            <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300">Variante B Gerada (A/B Test)</span>
                <span className="text-[10px] text-slate-400">Hipótese: {variantB.hypothesis}</span>
              </div>
              <p className="text-xs font-bold text-white">"{variantB.hook}"</p>
              <p className="text-xs text-slate-300 line-clamp-3">{variantB.caption}</p>
              <Button size="sm" onClick={() => handleSendToPool(true)} disabled={savingPool} className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                Enviar Variante B para o Content Pool
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
