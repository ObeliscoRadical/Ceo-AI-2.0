import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Plus, RefreshCw, Calendar, Send, Trash2, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Flame, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const ContentPoolSection = ({ poolData = {}, products = [], campaigns = [], onRefresh, onOpenStudio, api }) => {
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterProduct, setFilterProduct] = useState("ALL");
  const [filterCampaign, setFilterCampaign] = useState("ALL");
  const [generatingImgId, setGeneratingImgId] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const items = poolData.items || [];
  const counts = poolData.counts || {};
  const runway = poolData.runway || { available_stock: 0, daily_rate: 2, runway_days: 0, status: "healthy" };

  const missingImagesCount = items.filter(i => !i.image_url).length;

  const handleGenerateAllPoolImages = async (force = false) => {
    const targetCount = force ? items.length : missingImagesCount;
    if (targetCount === 0 && !force) {
      toast.info("Todos os conteúdos do pool já possuem imagens!");
      return;
    }
    if (force && !window.confirm(`Deseja regenerar as imagens de todos os ${items.length} posts do pool com o padrão fotográfico ultra-realista?`)) {
      return;
    }

    setGeneratingAll(true);
    toast.loading(
      force 
        ? `A regenerar ${items.length} imagens com IA no Content Pool... Isto pode demorar alguns instantes.` 
        : `A gerar ${missingImagesCount} imagens em falta com IA...`, 
      { id: "batch-pool-img" }
    );
    try {
      const res = await api.post("/marketing/pool/generate-all-images", { force });
      if (res.data?.ok) {
        toast.success(res.data.message || `${res.data.count} imagens geradas com sucesso!`, { id: "batch-pool-img" });
        onRefresh();
      } else {
        toast.error("Não foi possível gerar as imagens.", { id: "batch-pool-img" });
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar imagens em lote.", { id: "batch-pool-img" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      await api.put(`/marketing/pool/${itemId}/status`, { status: newStatus });
      toast.success(`Estado atualizado para ${newStatus}!`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao atualizar estado.");
    }
  };

  const handleGenerateImageForPoolItem = async (item) => {
    setGeneratingImgId(item.id);
    try {
      const res = await api.post("/marketing/studio/generate-image", {
        content_id: item.id,
        hook: item.hook || "",
        title: item.title || "",
        caption: item.caption || "",
        visual_briefing: item.visual_briefing || "",
        product_name: item.product_name || "",
      });
      if (res.data?.image_url) {
        toast.success("Imagem gerada e vinculada com sucesso ao post!");
        onRefresh();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar imagem com IA.");
    } finally {
      setGeneratingImgId(null);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Remover este conteúdo do pool?")) return;
    try {
      await api.delete(`/marketing/pool/${itemId}`);
      toast.success("Conteúdo removido.");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao remover conteúdo.");
    }
  };

  const filteredItems = items.filter(item => {
    if (filterStatus !== "ALL" && item.status !== filterStatus) return false;
    if (filterProduct !== "ALL" && item.product_id !== filterProduct) return false;
    if (filterCampaign !== "ALL" && item.campaign_id !== filterCampaign) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Content Runway Badge */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Content Pool (Banco de Conteúdos)</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Estoque central de peças criadas, aprovadas, agendadas e publicadas.
          </p>
        </div>

        {/* Content Runway Indicator */}
        <div className={`p-4 rounded-2xl border flex items-center gap-4 ${
          runway.status === "critical"
            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
            : runway.status === "warning"
            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        }`}>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider block">Content Runway (Estoque)</span>
            <span className="text-2xl font-black">{runway.runway_days} Dias</span>
          </div>
          <div className="text-xs border-l border-white/10 pl-3">
            <p><strong>{runway.available_stock}</strong> peças prontas</p>
            <p className="text-slate-400">{runway.daily_rate} posts/dia</p>
          </div>
        </div>
      </div>

      {/* Contadores por Estado Canónico */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: "DRAFT", count: counts.DRAFT || 0, color: "text-slate-400" },
          { label: "READY", count: counts.READY || 0, color: "text-emerald-400" },
          { label: "AVAILABLE", count: counts.AVAILABLE || 0, color: "text-blue-400" },
          { label: "SCHEDULED", count: counts.SCHEDULED || 0, color: "text-purple-400" },
          { label: "PUBLISHING", count: counts.PUBLISHING || 0, color: "text-amber-400" },
          { label: "PUBLISHED", count: counts.PUBLISHED || 0, color: "text-teal-400" },
          { label: "FAILED", count: counts.FAILED || 0, color: "text-rose-400" },
          { label: "PAUSED", count: counts.PAUSED || 0, color: "text-zinc-500" }
        ].map((st) => (
          <div
            key={st.label}
            onClick={() => setFilterStatus(filterStatus === st.label ? "ALL" : st.label)}
            className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
              filterStatus === st.label
                ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-slate-400 block">{st.label}</span>
            <span className={`text-xl font-bold mt-1 block ${st.color}`}>{st.count}</span>
          </div>
        ))}
      </div>

      {/* Filtros de Lista */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-48 bg-white/[0.03] border-white/10 text-white text-xs">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
              <SelectItem value="ALL">Todos os Produtos</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCampaign} onValueChange={setFilterCampaign}>
            <SelectTrigger className="w-48 bg-white/[0.03] border-white/10 text-white text-xs">
              <SelectValue placeholder="Campanha" />
            </SelectTrigger>
            <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
              <SelectItem value="ALL">Todas as Campanhas</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {items.length > 0 && (
            <>
              {missingImagesCount > 0 ? (
                <Button 
                  onClick={() => handleGenerateAllPoolImages(false)} 
                  disabled={generatingAll} 
                  size="sm" 
                  className="rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 border border-emerald-500/30"
                >
                  {generatingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      A Gerar Imagens...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                      Gerar Todas as Imagens em Falta ({missingImagesCount})
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={() => handleGenerateAllPoolImages(true)} 
                  disabled={generatingAll} 
                  variant="outline"
                  size="sm" 
                  className="rounded-xl border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold"
                >
                  {generatingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      A Regenerar...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                      Regenerar Todas as Imagens ({items.length})
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          <Button onClick={onOpenStudio} size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
            <Plus className="w-3.5 h-3.5 mr-1" /> Criar Novo Conteúdo
          </Button>
        </div>
      </div>

      {/* Grid de Itens do Pool */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
          <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-white">Nenhum conteúdo encontrado com estes filtros</h3>
          <p className="text-sm text-slate-400 mt-1">Abra o Studio para criar e abastecer o seu Content Pool.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0B0F17] p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-all shadow-md space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    item.status === "READY"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : item.status === "SCHEDULED"
                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      : item.status === "PUBLISHED"
                      ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                      : "bg-slate-500/10 text-slate-300 border border-slate-500/20"
                  }`}>
                    {item.status} · Var {item.variant_type || "A"}
                  </span>
                  <span className="text-[11px] text-slate-400">{item.network} · {item.format}</span>
                </div>

                {/* Preview da Imagem + Botão de Gerar/Regenerar */}
                <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10 h-36 flex items-center justify-center group">
                  {generatingImgId === item.id ? (
                    <div className="flex flex-col items-center justify-center p-3 text-center space-y-1.5">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-300">A gerar imagem com IA...</span>
                    </div>
                  ) : item.image_url ? (
                    <>
                      <img src={item.image_url} alt="Thumbnail" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          onClick={() => handleGenerateImageForPoolItem(item)}
                          disabled={generatingImgId === item.id}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold h-7 shadow"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Trocar Imagem
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center space-y-1.5">
                      <p className="text-[10px] text-slate-400">Sem imagem vinculada</p>
                      <Button
                        size="sm"
                        onClick={() => handleGenerateImageForPoolItem(item)}
                        disabled={generatingImgId === item.id}
                        className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-bold h-7 shadow"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Gerar Imagem com IA
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white line-clamp-1">{item.title}</h4>
                  {item.hook && (
                    <p className="text-xs text-purple-300 mt-1 line-clamp-2"><strong>Hook:</strong> "{item.hook}"</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 whitespace-pre-line">{item.caption}</p>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                  {item.product_name && <span className="bg-white/5 px-2 py-0.5 rounded">📦 {item.product_name}</span>}
                  {item.campaign_name && <span className="bg-white/5 px-2 py-0.5 rounded">🎯 {item.campaign_name}</span>}
                </div>

                {item.image_prompt && (
                  <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-slate-400 space-y-0.5">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" /> Prompt Visual Estratégico:
                    </span>
                    <p className="line-clamp-2 hover:line-clamp-none transition-all cursor-pointer text-slate-300 italic" title="Prompt visual gerado pelo Diretor de Arte">
                      "{item.image_prompt}"
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/5">
                <Select value={item.status} onValueChange={(v) => handleStatusChange(item.id, v)}>
                  <SelectTrigger className="h-7 text-[11px] bg-white/[0.03] border-white/10 text-white w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                    {["DRAFT", "READY", "AVAILABLE", "SCHEDULED", "PAUSED"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
