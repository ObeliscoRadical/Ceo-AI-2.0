import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Store, Plus, Sparkles, Loader2, Edit, Trash2, Tag, ArrowUpRight, Layers, Target, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const VitrineSection = ({ products = [], onRefresh, onSelectForCampaign, api }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Serviço");
  const [price, setPrice] = useState("");
  const [pricingModel, setPricingModel] = useState("Fixo");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [mainPain, setMainPain] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [offer, setOffer] = useState("");
  const [cta, setCta] = useState("Pedir Orçamento");
  const [positioning, setPositioning] = useState("");

  const openNew = () => {
    setEditingProduct(null);
    setName("");
    setCategory("Serviço");
    setPrice("");
    setPricingModel("Fixo");
    setDescription("");
    setTargetAudience("");
    setMainPain("");
    setValueProp("");
    setOffer("");
    setCta("Pedir Orçamento");
    setPositioning("");
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditingProduct(p);
    setName(p.name || "");
    setCategory(p.category || "Serviço");
    setPrice(p.price || "");
    setPricingModel(p.pricing_model || "Fixo");
    setDescription(p.description || "");
    setTargetAudience(p.target_audience || "");
    setMainPain(p.main_pain || "");
    setValueProp(p.value_prop || "");
    setOffer(p.offer || "");
    setCta(p.cta || "Pedir Orçamento");
    setPositioning(p.positioning || "");
    setModalOpen(true);
  };

  const handleAiEnhance = async () => {
    if (!name.trim()) {
      toast.error("Preencha pelo menos o nome do produto para o Diretor de IA analisar.");
      return;
    }
    setEnhancing(true);
    try {
      const res = await api.post("/marketing/products/ai-enhance", {
        name,
        category,
        price: parseFloat(price) || 0,
        description
      });
      const enh = res.data?.enhanced || {};
      if (enh.enhanced_description) setDescription(enh.enhanced_description);
      if (enh.target_audience) setTargetAudience(enh.target_audience);
      if (enh.main_pain) setMainPain(enh.main_pain);
      if (enh.value_prop) setValueProp(enh.value_prop);
      if (enh.offer) setOffer(enh.offer);
      if (enh.cta) setCta(enh.cta);
      if (enh.positioning) setPositioning(enh.positioning);
      toast.success("Posicionamento e proposta de valor otimizados com IA!");
    } catch (e) {
      toast.error("Erro ao otimizar produto com IA.");
    } finally {
      setEnhancing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("O nome do produto/serviço é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        category,
        price: parseFloat(price) || 0,
        pricing_model: pricingModel,
        description,
        target_audience: targetAudience,
        main_pain: mainPain,
        value_prop: valueProp,
        offer,
        cta,
        positioning,
        channels: ["Instagram", "Facebook", "LinkedIn"]
      };

      if (editingProduct?.id) {
        await api.put(`/marketing/products/${editingProduct.id}`, payload);
        toast.success("Produto atualizado na Vitrine!");
      } else {
        await api.post("/marketing/products", payload);
        toast.success("Produto registado na Vitrine com sucesso!");
      }
      setModalOpen(false);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao guardar produto.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem a certeza que deseja remover este produto da Vitrine?")) return;
    try {
      await api.delete(`/marketing/products/${id}`);
      toast.success("Produto removido.");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao remover produto.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Store className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Vitrine & Centro Comercial</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Catálogo central de produtos, serviços e ofertas. Todos os módulos de marketing reutilizam estes dados.
          </p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20">
          <Plus className="w-4 h-4 mr-2" /> Novo Produto / Serviço
        </Button>
      </div>

      {/* Grid de Produtos */}
      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
          <Store className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-white">A sua Vitrine ainda está vazia</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
            Adicione os seus produtos ou serviços principais para alimentar o Criador de Campanhas, o Studio e o Autopilot.
          </p>
          <Button onClick={openNew} variant="outline" className="mt-6 rounded-xl border-white/10 text-white hover:bg-white/5">
            <Plus className="w-4 h-4 mr-2" /> Criar Primeiro Produto
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-5 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300 group shadow-lg">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {p.category || "Serviço"}
                  </span>
                  <div className="text-right">
                    <span className="text-lg font-bold text-white">
                      {p.price ? `${p.price} €` : "Sob Orçamento"}
                    </span>
                    <p className="text-[11px] text-slate-400">{p.pricing_model || "Fixo"}</p>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                  {p.name}
                </h3>

                {p.value_prop && (
                  <p className="text-xs text-slate-300 mt-2 line-clamp-2 bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    <strong className="text-blue-400">UVP:</strong> {p.value_prop}
                  </p>
                )}

                {p.main_pain && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                    <strong className="text-rose-400">Dor:</strong> {p.main_pain}
                  </p>
                )}

                {p.offer && (
                  <p className="text-xs text-emerald-400/90 mt-2 line-clamp-1">
                    <strong>Oferta:</strong> {p.offer}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5 text-center text-[11px]">
                  <div className="bg-white/[0.02] p-2 rounded-lg">
                    <span className="text-slate-400 block">Campanhas</span>
                    <span className="font-bold text-white">{p.campaigns_count || 0}</span>
                  </div>
                  <div className="bg-white/[0.02] p-2 rounded-lg">
                    <span className="text-slate-400 block">Conteúdos</span>
                    <span className="font-bold text-white">{p.contents_count || 0}</span>
                  </div>
                  <div className="bg-white/[0.02] p-2 rounded-lg">
                    <span className="text-slate-400 block">Publicados</span>
                    <span className="font-bold text-emerald-400">{p.published_count || 0}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-white/5">
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)} className="h-8 w-8 p-0 text-slate-400 hover:text-white rounded-lg">
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button size="sm" onClick={() => onSelectForCampaign(p)} className="h-8 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-medium border border-blue-500/30 transition-all">
                  Criar Campanha <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Produto */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl bg-[#0B0F17] border-white/10 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-400" />
              {editingProduct ? "Editar Produto / Serviço" : "Registar Produto na Vitrine"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">Nome do Produto / Serviço *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Instalação Elétrica Industrial" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Categoria</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                    {["Serviço", "Produto", "Obra / Instalação", "Consultoria", "Subscrição", "Infoproduto", "Outro"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">Preço / Ticket Médio (€)</label>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 1500" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Modelo de Cobrança</label>
                <Select value={pricingModel} onValueChange={setPricingModel}>
                  <SelectTrigger className="mt-1 bg-white/[0.03] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B0F17] border-white/10 text-white">
                    {["Fixo", "Sob Orçamento", "Mensal / Recorrente", "Por Hora / Técnico", "Por Projeto"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleAiEnhance} disabled={enhancing} size="sm" variant="outline" className="rounded-xl border-purple-500/30 text-purple-300 hover:bg-purple-500/10 text-xs">
                {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-400" />}
                IA Otimizar Posicionamento & UVP
              </Button>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium">Descrição Comercial</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva a solução, escopo e diferenciais..." className="mt-1 bg-white/[0.03] border-white/10 text-white min-h-[70px]" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">Público-Alvo Prioritário</label>
                <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Ex.: Gestores de condomínio e fábricas" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Principal Dor Resolvida</label>
                <Input value={mainPain} onChange={(e) => setMainPain(e.target.value)} placeholder="Ex.: Paragens não programadas e avarias" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">Proposta Única de Valor (UVP)</label>
                <Input value={valueProp} onChange={(e) => setValueProp(e.target.value)} placeholder="Ex.: Resposta em 2h com garantia de 5 anos" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Oferta / Gancho Especial</label>
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Ex.: Diagnóstico térmico gratuito no 1º mês" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium">CTA Principal</label>
                <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex.: Pedir Orçamento Grátis" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">Posicionamento de Mercado</label>
                <Input value={positioning} onChange={(e) => setPositioning(e.target.value)} placeholder="Ex.: Especialista Industrial Premium" className="mt-1 bg-white/[0.03] border-white/10 text-white" />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white rounded-xl">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Guardar na Vitrine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
