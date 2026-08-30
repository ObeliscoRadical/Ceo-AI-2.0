import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Upload, Trash2, Loader2, ArrowUpRight, ArrowDownRight, Landmark,
  Pencil, TrendingUp, TrendingDown, Wallet, Target, Scale, Timer, Sparkles, Crown, AlertTriangle, ListChecks,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const SYM = { EUR: "€", BRL: "R$", USD: "$", GBP: "£" };
const money = (v, cur) => `${SYM[cur] || (cur ? cur + " " : "€")}${Number(v || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}`;

export default function Finances() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState({ type: "income", category: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const fileRef = useRef();

  // financial profile
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pf, setPf] = useState({ monthly_revenue: "", cash_balance: "", variable_costs_pct: "", total_debt: "", fixed_costs: [], assets: [], liabilities: [] });
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const load = () => api.get("/entries").then(({ data }) => setEntries(data)).finally(() => setLoading(false));
  const loadProfile = () => api.get("/finance/profile").then(({ data }) => setProfile(data));
  useEffect(() => { load(); loadProfile(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/entries", { ...form, amount: Number(form.amount) });
      setOpen(false);
      setForm({ type: "income", category: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
      toast.success("Registo adicionado"); load();
    } catch { toast.error("Erro ao adicionar"); }
  };
  const del = async (id) => { await api.delete(`/entries/${id}`); load(); };

  const connectBank = async () => {
    setConnecting(true);
    try { const { data } = await api.post("/bank/connect"); toast.success(`Banco ligado (demo) · ${data.imported} movimentos`); load(); }
    catch { toast.error("Não foi possível ligar o banco"); } finally { setConnecting(false); }
  };
  const importFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post("/entries/import", fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success(`${data.imported} registos importados com IA`); load(); }
    catch { toast.error("Não foi possível ler o ficheiro"); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ---- profile editor ----
  const openEditor = () => {
    setPf({
      monthly_revenue: profile?.monthly_revenue || "",
      cash_balance: profile?.cash_balance || "",
      variable_costs_pct: profile?.variable_costs_pct || "",
      total_debt: profile?.total_debt || "",
      assets: profile?.assets?.length ? profile.assets : [],
      liabilities: profile?.liabilities?.length ? profile.liabilities : [],
      fixed_costs: (profile?.fixed_costs?.length ? profile.fixed_costs : [{ name: "", amount: "" }]),
    });
    setEditing(true);
  };
  const setCost = (i, k, v) => setPf((s) => ({ ...s, fixed_costs: s.fixed_costs.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addCost = () => setPf((s) => ({ ...s, fixed_costs: [...s.fixed_costs, { name: "", amount: "" }] }));
  const rmCost = (i) => setPf((s) => ({ ...s, fixed_costs: s.fixed_costs.filter((_, idx) => idx !== i) }));
  const setItem = (key, i, k, v) => setPf((s) => ({ ...s, [key]: (s[key] || []).map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addItem = (key) => setPf((s) => ({ ...s, [key]: [...(s[key] || []), { name: "", amount: "" }] }));
  const rmItem = (key, i) => setPf((s) => ({ ...s, [key]: (s[key] || []).filter((_, idx) => idx !== i) }));
  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.post("/finance/profile", {
        monthly_revenue: Number(pf.monthly_revenue) || 0,
        cash_balance: Number(pf.cash_balance) || 0,
        variable_costs_pct: Number(pf.variable_costs_pct) || 0,
        total_debt: Number(pf.total_debt) || 0,
        fixed_costs: pf.fixed_costs.filter((c) => c.name || c.amount).map((c) => ({ name: c.name || "Custo", amount: Number(c.amount) || 0 })),
        assets: (pf.assets || []).filter((c) => c.name || c.amount).map((c) => ({ name: c.name || "Ativo", amount: Number(c.amount) || 0 })),
        liabilities: (pf.liabilities || []).filter((c) => c.name || c.amount).map((c) => ({ name: c.name || "Passivo", amount: Number(c.amount) || 0 })),
      });
      toast.success("Perfil financeiro guardado");
      setEditing(false); setAnalysis(null); await loadProfile();
    } catch (e) { toast.error("Erro ao guardar"); } finally { setSaving(false); }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try { const { data } = await api.get("/finance/profile/analysis"); setAnalysis(data); }
    catch { toast.error("Não foi possível analisar"); } finally { setAnalyzing(false); }
  };

  const income = entries.filter((e) => e.type === "income").reduce((a, b) => a + b.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((a, b) => a + b.amount, 0);
  const cur = profile?.currency || "EUR";
  const hasProfile = profile?.exists;

  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="font-serif-lux text-4xl">Finanças</h1>
        <p className="text-muted-foreground text-sm mt-1">Diz-me quanto faturas e gastas. Eu analiso a tua empresa como um sócio.</p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList className="mb-6" data-testid="finance-tabs">
          <TabsTrigger value="perfil" data-testid="tab-perfil">Perfil Financeiro</TabsTrigger>
          <TabsTrigger value="movimentos" data-testid="tab-movimentos">Movimentos</TabsTrigger>
        </TabsList>

        {/* -------------------- PERFIL -------------------- */}
        <TabsContent value="perfil">
          {!hasProfile ? (
            <div className="surface rounded-2xl p-10 text-center" data-testid="profile-empty">
              <Wallet className="w-10 h-10 text-[#3B82F6] mx-auto mb-4" />
              <h3 className="font-serif-lux text-2xl mb-2">Vamos ver a tua empresa a fundo</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">Insere o teu faturamento mensal e os custos. Em segundos, mostro-te lucro, margem, ponto de equilíbrio e quanto tempo o teu caixa aguenta.</p>
              <Button data-testid="fill-profile-btn" onClick={openEditor} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]"><Plus className="w-4 h-4 mr-2" />Preencher perfil financeiro</Button>
            </div>
          ) : (
            <div className="space-y-6" data-testid="profile-view">
              <div className="flex justify-end">
                <Button data-testid="edit-profile-btn" variant="outline" onClick={openEditor} className="rounded-full"><Pencil className="w-4 h-4 mr-2" />Editar perfil</Button>
              </div>

              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric icon={TrendingUp} tone="#3B82F6" label="Faturamento / mês" value={money(profile.monthly_revenue, cur)} />
                <Metric icon={TrendingDown} tone="#EF4444" label="Custos totais / mês" value={money(profile.total_costs, cur)} />
                <Metric icon={profile.profit >= 0 ? TrendingUp : TrendingDown} tone={profile.profit >= 0 ? "#10B981" : "#EF4444"} label="Lucro / mês" value={money(profile.profit, cur)} />
                <Metric icon={Scale} tone={profile.margin_pct >= 15 ? "#10B981" : profile.margin_pct >= 5 ? "#F59E0B" : "#EF4444"} label="Margem líquida" value={`${profile.margin_pct}%`} />
                <Metric icon={Target} tone="#8B5CF6" label="Ponto de equilíbrio" value={money(profile.break_even_revenue, cur)} sub="faturar p/ não ter prejuízo" />
                <Metric icon={Timer} tone={profile.runway_months == null ? "#10B981" : profile.runway_months >= 6 ? "#10B981" : profile.runway_months >= 3 ? "#F59E0B" : "#EF4444"} label="Runway (caixa)" value={profile.runway_months == null ? "Saudável" : `${profile.runway_months} meses`} />
                <Metric icon={Wallet} tone="#3B82F6" label="Saldo em caixa" value={money(profile.cash_balance, cur)} />
                <Metric icon={AlertTriangle} tone="#F59E0B" label="Maior custo" value={profile.biggest_cost ? money(profile.biggest_cost.amount, cur) : "—"} sub={profile.biggest_cost?.name || ""} />
                <Metric icon={Landmark} tone={profile.total_debt > 0 ? "#EF4444" : "#10B981"} label="Dívida total" value={money(profile.total_debt, cur)} sub={profile.debt_revenue_months ? `${profile.debt_revenue_months} meses de faturação` : "sem dívida"} />
                <Metric icon={Scale} tone={profile.net_position >= 0 ? "#10B981" : "#EF4444"} label="Posição líquida" value={money(profile.net_position, cur)} sub="caixa − dívida" />
              </div>

              {/* Metas vs Realidade */}
              {profile.target_revenue_month > 0 && (
                <div className="surface rounded-2xl p-6" data-testid="goal-vs-real">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Meta vs Realidade</h3>
                    <span className="text-xs text-muted-foreground">Meta: {money(profile.target_revenue_month, cur)}/mês</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#10B981] transition-all" style={{ width: `${profile.target_progress_pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-muted-foreground">Atual: {money(profile.monthly_revenue, cur)} ({profile.target_progress_pct}%)</span>
                    <span className={profile.target_gap > 0 ? "text-[#F59E0B]" : "text-[#10B981]"}>{profile.target_gap > 0 ? `Faltam ${money(profile.target_gap, cur)}/mês` : "Meta atingida 🎉"}</span>
                  </div>
                </div>
              )}

              {/* Estrutura de custos */}
              {profile.fixed_costs?.length > 0 && (
                <div className="surface rounded-2xl p-6" data-testid="cost-structure">
                  <h3 className="text-sm font-semibold mb-4">Estrutura de custos fixos</h3>
                  <div className="space-y-3">
                    {profile.fixed_costs.slice().sort((a, b) => b.amount - a.amount).map((c, i) => {
                      const pct = profile.total_fixed > 0 ? (c.amount / profile.total_fixed) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1"><span>{c.name}</span><span className="text-muted-foreground">{money(c.amount, cur)} · {pct.toFixed(0)}%</span></div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-[#EF4444]/70" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                    {profile.variable_costs_value > 0 && (
                      <div className="pt-2 text-xs text-muted-foreground">+ Custos variáveis: {profile.variable_costs_pct}% da receita = {money(profile.variable_costs_value, cur)}/mês</div>
                    )}
                  </div>
                </div>
              )}

              {/* Património / Balanço */}
              {(profile.total_assets > 0 || profile.total_liabilities > 0) && (
                <div className="surface rounded-2xl p-6" data-testid="balance-sheet">
                  <h3 className="text-sm font-semibold mb-4">Património (Balanço)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="rounded-xl bg-[#10B981]/10 p-4"><p className="text-xs text-muted-foreground mb-1">Total de ativos</p><div className="font-serif-lux text-2xl text-[#10B981]">{money(profile.total_assets, cur)}</div></div>
                    <div className="rounded-xl bg-[#EF4444]/10 p-4"><p className="text-xs text-muted-foreground mb-1">Total de passivos</p><div className="font-serif-lux text-2xl text-[#EF4444]">{money(profile.total_liabilities, cur)}</div></div>
                    <div className={`rounded-xl p-4 ${profile.net_worth >= 0 ? "bg-[#3B82F6]/10" : "bg-[#EF4444]/10"}`}><p className="text-xs text-muted-foreground mb-1">Património líquido</p><div className="font-serif-lux text-2xl" style={{ color: profile.net_worth >= 0 ? "#3B82F6" : "#EF4444" }}>{money(profile.net_worth, cur)}</div></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                    <div>
                      <div className="text-xs font-semibold text-[#10B981] mb-2">Ativos</div>
                      <ul className="space-y-1.5">
                        <li className="flex justify-between"><span className="text-muted-foreground">Caixa</span><span>{money(profile.cash_balance, cur)}</span></li>
                        {profile.assets?.map((a, i) => <li key={i} className="flex justify-between"><span className="text-muted-foreground">{a.name}</span><span>{money(a.amount, cur)}</span></li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#EF4444] mb-2">Passivos</div>
                      <ul className="space-y-1.5">
                        {profile.total_debt > 0 && <li className="flex justify-between"><span className="text-muted-foreground">Dívida / financiamentos</span><span>{money(profile.total_debt, cur)}</span></li>}
                        {profile.liabilities?.map((l, i) => <li key={i} className="flex justify-between"><span className="text-muted-foreground">{l.name}</span><span>{money(l.amount, cur)}</span></li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* CEO Analysis */}
              <div className="surface rounded-2xl p-6" data-testid="ceo-analysis">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#3B82F6]" />Análise do CEO</h3>
                  {!analysis && <Button data-testid="analyze-btn" size="sm" onClick={runAnalysis} disabled={analyzing} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">{analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analisar agora"}</Button>}
                </div>
                {analyzing ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="analysis-loading"><Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />A analisar a tua empresa…</div>
                ) : !analysis ? (
                  <p className="text-sm text-muted-foreground">Pede ao teu CEO AI 2.0 um diagnóstico com riscos e ações concretas para este mês.</p>
                ) : analysis.premium_locked ? (
                  <div className="text-center py-4" data-testid="analysis-locked">
                    <Crown className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-4">O diagnóstico completo do CEO faz parte do plano Premium.</p>
                    <Button onClick={() => navigate("/planos")} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">Passar a Premium</Button>
                  </div>
                ) : analysis.analysis ? (
                  <div className="space-y-4 text-sm">
                    <p className="leading-relaxed">{analysis.analysis.diagnostico}</p>
                    {analysis.analysis.riscos?.length > 0 && (
                      <div><div className="text-xs font-semibold text-[#F59E0B] mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Riscos</div>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">{analysis.analysis.riscos.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                    )}
                    {analysis.analysis.prioridades?.length > 0 && (
                      <div><div className="text-xs font-semibold text-[#3B82F6] mb-1 flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" />Prioridades</div>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">{analysis.analysis.prioridades.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                    )}
                    {analysis.analysis.acoes?.length > 0 && (
                      <div className="grid gap-2">{analysis.analysis.acoes.map((a, i) => (
                        <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <div className="font-medium text-[13px]">{a.titulo}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{a.impacto}</div>
                        </div>))}</div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Não foi possível gerar a análise agora. Tenta novamente.</p>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* -------------------- MOVIMENTOS -------------------- */}
        <TabsContent value="movimentos">
          <div className="flex flex-wrap items-center justify-end gap-3 mb-6">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" onChange={importFile} className="hidden" data-testid="import-input" />
            <Button data-testid="connect-bank-btn" variant="outline" onClick={connectBank} disabled={connecting} className="rounded-full">{connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Landmark className="w-4 h-4 mr-2" />} Ligar banco (demo)</Button>
            <Button data-testid="import-btn" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="rounded-full">{importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />} Importar CSV</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-testid="add-entry-btn" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]"><Plus className="w-4 h-4 mr-2" />Novo registo</Button></DialogTrigger>
              <DialogContent className="surface">
                <DialogHeader><DialogTitle className="font-serif-lux text-2xl">Novo registo financeiro</DialogTitle>
                  <DialogDescription className="text-muted-foreground text-sm">Regista uma receita ou despesa pontual.</DialogDescription></DialogHeader>
                <form onSubmit={add} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-xs text-muted-foreground">Tipo</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                        <SelectTrigger data-testid="entry-type" className="mt-1 bg-transparent"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="income">Receita</SelectItem><SelectItem value="expense">Despesa</SelectItem></SelectContent>
                      </Select></div>
                    <div><Label className="text-xs text-muted-foreground">Valor</Label><Input data-testid="entry-amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="mt-1 bg-transparent" /></div>
                  </div>
                  <div><Label className="text-xs text-muted-foreground">Categoria</Label><Input data-testid="entry-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required className="mt-1 bg-transparent" placeholder="Ex: Vendas, Salários, Renda" /></div>
                  <div><Label className="text-xs text-muted-foreground">Data</Label><Input data-testid="entry-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 bg-transparent" /></div>
                  <div><Label className="text-xs text-muted-foreground">Descrição</Label><Input data-testid="entry-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 bg-transparent" /></div>
                  <Button data-testid="save-entry-btn" type="submit" className="w-full rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">Guardar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="surface rounded-2xl p-6"><p className="text-xs text-muted-foreground mb-2">Receitas</p><div className="font-serif-lux text-3xl text-[#10B981]">{money(income, cur)}</div></div>
            <div className="surface rounded-2xl p-6"><p className="text-xs text-muted-foreground mb-2">Despesas</p><div className="font-serif-lux text-3xl text-[#EF4444]">{money(expense, cur)}</div></div>
            <div className="surface rounded-2xl p-6"><p className="text-xs text-muted-foreground mb-2">Resultado</p><div className="font-serif-lux text-3xl text-[#3B82F6]">{money(income - expense, cur)}</div></div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Ainda sem registos. Adiciona um ou importa um CSV.</div>
          ) : (
            <div className="surface rounded-2xl overflow-hidden">
              {entries.map((e, i) => (
                <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0" data-testid={`entry-${e.id}`}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: e.type === "income" ? "#10B98122" : "#EF444422" }}>
                    {e.type === "income" ? <ArrowUpRight className="w-4 h-4 text-[#10B981]" /> : <ArrowDownRight className="w-4 h-4 text-[#EF4444]" />}
                  </div>
                  <div className="flex-1 min-w-0"><div className="font-medium text-sm">{e.category}</div><div className="text-xs text-muted-foreground">{e.date}{e.description ? ` · ${e.description}` : ""}</div></div>
                  <div className={`font-medium ${e.type === "income" ? "text-[#10B981]" : "text-[#EF4444]"}`}>{e.type === "income" ? "+" : "-"}{money(e.amount, cur)}</div>
                  <button onClick={() => del(e.id)} data-testid={`delete-${e.id}`} className="text-muted-foreground hover:text-[#EF4444] transition-colors"><Trash2 className="w-4 h-4" /></button>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Profile editor dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="surface max-h-[85vh] overflow-y-auto" data-testid="profile-editor">
          <DialogHeader><DialogTitle className="font-serif-lux text-2xl">Perfil financeiro</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">Valores médios mensais. Usados pelo CEO AI 2.0 para analisar a empresa.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs text-muted-foreground">Faturamento mensal</Label><Input data-testid="pf-revenue" type="number" step="0.01" value={pf.monthly_revenue} onChange={(e) => setPf({ ...pf, monthly_revenue: e.target.value })} className="mt-1 bg-transparent" placeholder="Ex: 25000" /></div>
              <div><Label className="text-xs text-muted-foreground">Saldo em caixa</Label><Input data-testid="pf-cash" type="number" step="0.01" value={pf.cash_balance} onChange={(e) => setPf({ ...pf, cash_balance: e.target.value })} className="mt-1 bg-transparent" placeholder="Ex: 40000" /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Custos variáveis (% da receita)</Label><Input data-testid="pf-varpct" type="number" step="0.1" value={pf.variable_costs_pct} onChange={(e) => setPf({ ...pf, variable_costs_pct: e.target.value })} className="mt-1 bg-transparent" placeholder="Ex: 30 (matérias-primas, comissões...)" /></div>
            <div><Label className="text-xs text-muted-foreground">Dívida total (empréstimos, financiamentos)</Label><Input data-testid="pf-debt" type="number" step="0.01" value={pf.total_debt} onChange={(e) => setPf({ ...pf, total_debt: e.target.value })} className="mt-1 bg-transparent" placeholder="Ex: 55000 (inclui financiamento da viatura)" /></div>
            <div>
              <div className="flex items-center justify-between mb-2"><Label className="text-xs text-muted-foreground">Custos fixos mensais</Label>
                <button type="button" data-testid="add-cost-btn" onClick={addCost} className="text-xs text-[#3B82F6] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Adicionar</button></div>
              <div className="space-y-2">
                {pf.fixed_costs.map((c, i) => (
                  <div key={i} className="flex gap-2" data-testid={`cost-row-${i}`}>
                    <Input value={c.name} onChange={(e) => setCost(i, "name", e.target.value)} className="bg-transparent flex-1" placeholder="Ex: Salários, Renda, Software" data-testid={`cost-name-${i}`} />
                    <Input type="number" step="0.01" value={c.amount} onChange={(e) => setCost(i, "amount", e.target.value)} className="bg-transparent w-32" placeholder="Valor" data-testid={`cost-amount-${i}`} />
                    <button type="button" onClick={() => rmCost(i)} className="text-muted-foreground hover:text-[#EF4444] px-1" data-testid={`cost-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><Label className="text-xs text-muted-foreground">Ativos (o que a empresa tem)</Label>
                <button type="button" data-testid="add-asset-btn" onClick={() => addItem("assets")} className="text-xs text-[#3B82F6] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Adicionar</button></div>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Ex.: veículos (valor de mercado atual), ferramentas, stock, equipamento, contas a receber. A caixa já está acima.</p>
              <div className="space-y-2">
                {(pf.assets || []).map((c, i) => (
                  <div key={i} className="flex gap-2" data-testid={`asset-row-${i}`}>
                    <Input value={c.name} onChange={(e) => setItem("assets", i, "name", e.target.value)} className="bg-transparent flex-1" placeholder="Ex: Carrinhas, Ferramentas, Stock" data-testid={`asset-name-${i}`} />
                    <Input type="number" step="0.01" value={c.amount} onChange={(e) => setItem("assets", i, "amount", e.target.value)} className="bg-transparent w-32" placeholder="Valor" data-testid={`asset-amount-${i}`} />
                    <button type="button" onClick={() => rmItem("assets", i)} className="text-muted-foreground hover:text-[#EF4444] px-1" data-testid={`asset-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><Label className="text-xs text-muted-foreground">Passivos (o que a empresa deve)</Label>
                <button type="button" data-testid="add-liability-btn" onClick={() => addItem("liabilities")} className="text-xs text-[#3B82F6] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Adicionar</button></div>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Ex.: fornecedores a pagar, impostos a pagar, outros empréstimos. Os financiamentos já estão no campo "Dívida total".</p>
              <div className="space-y-2">
                {(pf.liabilities || []).map((c, i) => (
                  <div key={i} className="flex gap-2" data-testid={`liability-row-${i}`}>
                    <Input value={c.name} onChange={(e) => setItem("liabilities", i, "name", e.target.value)} className="bg-transparent flex-1" placeholder="Ex: Fornecedores, Impostos a pagar" data-testid={`liability-name-${i}`} />
                    <Input type="number" step="0.01" value={c.amount} onChange={(e) => setItem("liabilities", i, "amount", e.target.value)} className="bg-transparent w-32" placeholder="Valor" data-testid={`liability-amount-${i}`} />
                    <button type="button" onClick={() => rmItem("liabilities", i)} className="text-muted-foreground hover:text-[#EF4444] px-1" data-testid={`liability-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <Button data-testid="save-profile-btn" onClick={saveProfile} disabled={saving} className="w-full rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar perfil"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className="surface rounded-2xl p-5">
      <Icon className="w-5 h-5 mb-3" style={{ color: tone }} />
      <div className="font-serif-lux text-2xl" style={{ color: tone }}>{value}</div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {sub ? <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p> : null}
    </div>
  );
}
