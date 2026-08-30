import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Loader2, Target, TrendingUp, Sparkles, AlertTriangle, MapPin, Flag,
  Gauge, ArrowUpRight, Wallet, Percent, LineChart, CheckCircle2, Clock, SlidersHorizontal, Table2,
  ChevronDown, FileDown, Mail, Info, Share2, Copy, ExternalLink,
} from "lucide-react";

const fmt = (sym, n) => `${sym}${Number(n || 0).toLocaleString(sym === "R$" ? "pt-BR" : "pt-PT", { maximumFractionDigits: 0 })}`;
const PRESETS = [1, 2, 3, 5, 7, 10];
const VIAB = {
  green: { color: "#10B981", Icon: CheckCircle2 },
  amber: { color: "#F59E0B", Icon: Clock },
  red: { color: "#EF4444", Icon: AlertTriangle },
};

// ---- Motor de avaliação (espelha core.py; recálculo instantâneo no cliente, sem gastar créditos) ----
function valueMultiple(marginPct, recurBonus = 0) {
  let m = 2.0;
  if (marginPct >= 10) m += 0.5;
  if (marginPct >= 20) m += 0.5;
  if (marginPct >= 30) m += 0.5;
  return m + recurBonus;
}
function recurrenceBonus(recurPct) {
  if (recurPct >= 60) return 0.5;
  if (recurPct >= 30) return 0.25;
  return 0;
}

function ProgressBar({ pct, color }) {
  return (
    <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
    </div>
  );
}
function StatCard({ label, value, sub, color, testid, Icon }) {
  return (
    <div className="surface rounded-2xl p-5" data-testid={testid}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />} {label}
      </div>
      <div className="font-serif-lux text-2xl md:text-[26px]" style={{ color: color || undefined }}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1.5">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, sym }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0A0A12] px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}: {fmt(sym, p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Metas() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [targetValue, setTargetValue] = useState("");
  const [years, setYears] = useState(5);
  const [custom, setCustom] = useState(false);
  const [ytdRevenue, setYtdRevenue] = useState("");
  const [ytdAsOf, setYtdAsOf] = useState("");

  // Sliders / cenário ativo
  const [scenario, setScenario] = useState("realista");
  const [s, setS] = useState({ growth: 15, margin: 12, debtRed: 20, recur: 20 });
  const [howOpen, setHowOpen] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [multLocal, setMultLocal] = useState(null);

  const load = () => api.get("/goal").then(({ data }) => {
    setData(data);
    const g = data.goal || {};
    if (g.target_value != null) setTargetValue(String(g.target_value));
    if (g.ytd_revenue != null) setYtdRevenue(String(g.ytd_revenue));
    if (g.ytd_as_of) setYtdAsOf(String(g.ytd_as_of).slice(0, 7));
    if (g.deadline_years != null) {
      setYears(Number(g.deadline_years));
      setCustom(!PRESETS.includes(Number(g.deadline_years)));
    }
  }).catch(() => setFailed(true));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (data?.valuation?.used_multiple != null) setMultLocal(data.valuation.used_multiple);
  }, [data?.valuation?.method, data?.valuation?.used_multiple]);

  const setMethod = async (m) => {
    try { await api.post("/goal", { valuation_method: m, value_multiple_custom: null }); await load(); }
    catch { toast.error("Não foi possível mudar o método."); }
  };
  const commitMult = async (v) => {
    try { await api.post("/goal", { valuation_method: data?.valuation?.method, value_multiple_custom: v }); await load(); }
    catch { toast.error("Não foi possível aplicar o múltiplo."); }
  };

  // Base para simulação (a partir dos dados reais do backend)
  const base = useMemo(() => {
    if (!data) return null;
    const curMargin = data.current_margin != null && data.current_margin > 0 ? data.current_margin : 10;
    return {
      revenue: data.current_revenue || 0,
      netWorth: data.net_worth || 0,
      cash: data.cash || 0,
      debt: data.total_liabilities || 0,
      margin: curMargin,
      target: data.target_value || 0,
      yearsLeft: data.years_left || 5,
      n: data.trajectory ? data.trajectory.length - 1 : Math.max(1, Math.round(data.years_left || 5)),
    };
  }, [data]);

  // Presets dos 3 cenários (derivados dos dados reais)
  const presets = useMemo(() => {
    if (!base) return {};
    const cm = base.margin;
    return {
      conservador: { growth: 5, margin: Math.round(cm), debtRed: 0, recur: 10 },
      realista: { growth: 15, margin: Math.round(cm + 4), debtRed: 20, recur: 25 },
      ambicioso: { growth: 30, margin: Math.round(Math.min(45, cm + 12)), debtRed: 50, recur: 50 },
    };
  }, [base]);

  // Aplica preset "realista" quando os dados carregam
  useEffect(() => {
    if (base && presets.realista) { setS(presets.realista); setScenario("realista"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.margin, base?.target]);

  const applyScenario = (key) => { setScenario(key); setS(presets[key]); };

  // Projeção do cenário atual (com os sliders) — recálculo instantâneo
  const sim = useMemo(() => {
    if (!base || !base.revenue) return null;
    const bonus = recurrenceBonus(s.recur);
    const point = (k) => {
      const rev = base.revenue * Math.pow(1 + s.growth / 100, k);
      const profit = rev * (s.margin / 100);
      const debtK = base.debt * (1 - (s.debtRed / 100) * (base.n ? k / base.n : 0));
      const netWorthK = base.netWorth + base.debt * (s.debtRed / 100) * (base.n ? k / base.n : 0);
      const mult = valueMultiple(s.margin, bonus);
      const value = Math.max(netWorthK + Math.max(0, profit) * mult, base.cash);
      return { rev, profit, debt: debtK, value, mult };
    };
    const rows = [];
    for (let k = 1; k <= base.n; k++) rows.push({ k, ...point(k) });
    const end = point(base.n);
    const reachPct = base.target ? (end.value / base.target) * 100 : 0;
    return { point, rows, end, reachPct };
  }, [base, s]);

  // Dados do gráfico: verde (meta) + laranja (ritmo atual) + azul (meus ajustes)
  const chartData = useMemo(() => {
    if (!data?.trajectory) return [];
    return data.trajectory.map((t, i) => ({
      label: t.label, goal: t.goal, pace: t.pace,
      mine: sim ? (i === 0 ? data.current_value : sim.point(i).value) : undefined,
    }));
  }, [data, sim]);

  const scenarioEndValue = (key) => {
    if (!base || !base.revenue) return null;
    const p = presets[key]; if (!p) return null;
    const bonus = recurrenceBonus(p.recur);
    const rev = base.revenue * Math.pow(1 + p.growth / 100, base.n);
    const profit = rev * (p.margin / 100);
    const netWorthK = base.netWorth + base.debt * (p.debtRed / 100);
    const value = Math.max(netWorthK + Math.max(0, profit) * valueMultiple(p.margin, bonus), base.cash);
    const growthTotal = base.revenue ? Math.round((rev / base.revenue - 1) * 100) : null;
    return { rev, profit, monthly: rev / 12, margin: p.margin, growth: p.growth, growthTotal, value };
  };

  const calc = async () => {
    if (!targetValue || Number(targetValue) <= 0) { toast.error("Indique o valor que pretende alcançar."); return; }
    setSaving(true);
    try {
      await api.post("/goal", {
        target_value: Number(targetValue), deadline_type: "years", deadline_years: Number(years),
        ytd_revenue: ytdRevenue ? Number(ytdRevenue) : null,
        ytd_as_of: ytdAsOf || null,
      });
      setPlan(null);
      await load();
      toast.success("Projeção calculada com os seus dados reais.");
    } catch { toast.error("Não foi possível calcular a projeção."); }
    setSaving(false);
  };

  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const { data } = await api.post("/goal/plan");
      setPlan(data.ceo_plan || {});
    } catch { toast.error("Não foi possível gerar a perspetiva agora."); }
    setPlanLoading(false);
  };

  const printReport = () => navigate("/relatorio-meta");
  const notifyEmail = async () => {
    setNotifying(true);
    try {
      const { data } = await api.post("/goal/notify");
      if (data.ok) toast.success(`Aviso enviado para ${data.sent_to} (${Math.round(data.pct)}% da meta).`);
      else toast.error("Não foi possível enviar o aviso agora.");
    } catch { toast.error("Não foi possível enviar o aviso agora."); }
    setNotifying(false);
  };
  const share = async () => {
    setSharing(true);
    try {
      const { data } = await api.post("/goal/share");
      if (data.ok && data.token) {
        const url = `${window.location.origin}/partilha/meta/${data.token}`;
        setShareUrl(url);
        try { await navigator.clipboard.writeText(url); toast.success("Link copiado! Já o podes enviar."); }
        catch { toast.success("Link de partilha gerado."); }
      } else toast.error("Define e calcula a meta primeiro.");
    } catch { toast.error("Não foi possível gerar o link agora."); }
    setSharing(false);
  };
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copiado!"); } catch {}
  };

  if (failed) return <div className="text-center py-40 text-muted-foreground" data-testid="meta-error">Não foi possível carregar. Atualiza a página.</div>;
  if (!data) return <div className="flex justify-center py-40"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;

  const sym = data.currency_symbol;
  const cfg = data.configured;
  const req = data.required || {};
  const vinfo = data.valuation || {};
  const vmethod = vinfo.method || "auto";
  const sugg = vinfo.suggestions || {};
  const msug = vmethod === "revenue" ? sugg.revenue : vmethod === "ebitda" ? sugg.ebitda : null;
  const viab = data.viability ? (VIAB[data.viability.level] || VIAB.amber) : null;
  const simViabLevel = sim ? (sim.reachPct >= 100 ? "green" : sim.reachPct >= 60 ? "amber" : "red") : "amber";
  const simViab = VIAB[simViabLevel];

  const SCEN = [
    { key: "conservador", label: "Conservador", color: "#F59E0B", diff: "Menor risco" },
    { key: "realista", label: "Realista", color: "#3B82F6", diff: "Equilibrado" },
    { key: "ambicioso", label: "Ambicioso", color: "#10B981", diff: "Mais exigente" },
  ];

  const SLIDERS = [
    { key: "growth", label: "Crescimento anual da faturação", suffix: "%", min: 0, max: 60, step: 1, hint: "mais clientes ou maior valor por cliente" },
    { key: "margin", label: "Margem líquida (rentabilidade / redução de custos)", suffix: "%", min: 0, max: 50, step: 1, hint: "lucro sobre faturação" },
    { key: "debtRed", label: "Redução da dívida", suffix: "%", min: 0, max: 100, step: 5, hint: "liberta valor patrimonial" },
    { key: "recur", label: "Receitas recorrentes", suffix: "%", min: 0, max: 100, step: 5, hint: "sobe o múltiplo de avaliação" },
  ];

  return (
    <div className="px-6 md:px-16 py-14 md:py-20 max-w-[1040px] mx-auto" data-testid="metas-page">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">Metas e Projeções</p>
      <div className="mb-10">
        <h1 className="font-serif-lux text-4xl md:text-5xl text-[#3B82F6] flex items-center gap-3">
          <LineChart className="w-8 h-8" /> Projeção de Valor da Empresa
        </h1>
        <p className="text-muted-foreground mt-3">Planeie o futuro da sua empresa com base nos seus dados reais.</p>
      </div>

      {data.missing?.length > 0 && (
        <div className="rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/[0.06] p-5 mb-8" data-testid="meta-missing">
          <div className="flex items-center gap-2 text-[#F59E0B] font-medium mb-2"><AlertTriangle className="w-4 h-4" /> Faltam dados para uma projeção fiável</div>
          <ul className="text-sm text-muted-foreground space-y-1">
            {data.missing.map((m, i) => (
              <li key={i}>• <span className="text-foreground">{m.label}</span> — preencha em <span className="text-[#3B82F6]">{m.where}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Pergunta ao utilizador */}
      <div className="surface rounded-3xl p-6 md:p-8 mb-10" data-testid="meta-form" data-print-hide>
        <h2 className="font-serif-lux text-2xl mb-1">Qual é o valor que pretende alcançar?</h2>
        <p className="text-sm text-muted-foreground mb-5">Esta é uma meta de <span className="text-foreground font-medium">valor da empresa</span> — não de faturação.</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <Label className="text-sm text-muted-foreground">Meta de valor da empresa ({sym})</Label>
            <Input data-testid="input-target-value" type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="ex: 750000" className="mt-1.5 text-lg" />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Em quanto tempo pretende alcançar?</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PRESETS.map((y) => (
                <button key={y} data-testid={`years-${y}`} onClick={() => { setYears(y); setCustom(false); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${!custom && years === y ? "bg-[#3B82F6] text-white border-transparent" : "border-white/10 text-muted-foreground hover:text-white"}`}>
                  {y} {y === 1 ? "ano" : "anos"}
                </button>
              ))}
              <button data-testid="years-custom" onClick={() => setCustom(true)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${custom ? "bg-[#3B82F6] text-white border-transparent" : "border-white/10 text-muted-foreground hover:text-white"}`}>
                Personalizado
              </button>
            </div>
            {custom && (
              <Input data-testid="input-custom-years" type="number" min="0.5" step="0.5" value={years} onChange={(e) => setYears(e.target.value)} className="mt-3 max-w-[160px]" placeholder="anos" />
            )}
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-white/[0.06]">
          <Label className="text-sm text-foreground font-medium">Já faturaste algo este ano? <span className="text-muted-foreground font-normal">(opcional, mas torna a projeção mais precisa)</span></Label>
          <div className="grid md:grid-cols-2 gap-6 mt-3">
            <div>
              <Label className="text-sm text-muted-foreground">Faturação já feita este ano ({sym})</Label>
              <Input data-testid="input-ytd-revenue" type="number" value={ytdRevenue} onChange={(e) => setYtdRevenue(e.target.value)} placeholder="acumulado do ano em vigor" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Até que mês se refere</Label>
              <Input data-testid="input-ytd-asof" type="month" value={ytdAsOf} onChange={(e) => setYtdAsOf(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Uso este valor para estimar a tua faturação anual ao ritmo atual (acumulado ÷ meses × 12).</p>
        </div>

        <Button data-testid="calc-projection-btn" onClick={calc} disabled={saving} className="mt-7 rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gauge className="w-4 h-4 mr-2" />} Calcular Projeção
        </Button>
      </div>

      {/* Método de avaliação (motor híbrido) */}
      <div className="surface rounded-3xl p-6 md:p-8 mb-10" data-testid="valuation-method" data-print-hide>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h2 className="font-serif-lux text-2xl flex items-center gap-2"><Gauge className="w-5 h-5 text-[#3B82F6]" /> Método de Avaliação</h2>
          {sugg.sector_label && (
            <span className="text-xs text-muted-foreground px-3 py-1.5 rounded-full border border-white/10">
              Setor: {sugg.sector_label} · {sugg.region}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-5">Escolha como estimar o valor da empresa. Sugerimos o múltiplo ideal por setor/região — pode ajustá-lo à mão.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { key: "auto", label: "Automático", desc: "Património + rendimento (recomendado)" },
            { key: "revenue", label: "Múltiplo de Faturação", desc: "Valor = faturação × múltiplo · bom para PME" },
            { key: "ebitda", label: "Múltiplo de EBITDA", desc: "Valor = EBITDA × múltiplo · empresas estruturadas" },
          ].map((m) => {
            const active = vmethod === m.key;
            return (
              <button key={m.key} data-testid={`method-${m.key}`} onClick={() => setMethod(m.key)}
                className={`text-left rounded-2xl p-4 border transition-all ${active ? "border-2 border-[#3B82F6] bg-[#3B82F6]/[0.06]" : "border-white/[0.08] hover:border-white/20"}`}>
                <div className={`font-medium mb-1 ${active ? "text-[#3B82F6]" : ""}`}>{m.label}</div>
                <div className="text-[11px] text-muted-foreground leading-snug">{m.desc}</div>
              </button>
            );
          })}
        </div>

        {msug && (
          <div className="mt-6 pt-6 border-t border-white/[0.06]" data-testid="multiple-control">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Múltiplo aplicado {vmethod === "revenue" ? "(× faturação anual)" : "(× EBITDA)"}</Label>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-[#3B82F6]" data-testid="multiple-value">{Number(multLocal ?? msug.suggested).toFixed(1)}×</span>
                {vinfo.custom && (
                  <button data-testid="multiple-reset" onClick={() => { setMultLocal(msug.suggested); commitMult(null); }} className="text-xs text-muted-foreground hover:text-white underline">usar sugerido ({msug.suggested}×)</button>
                )}
              </div>
            </div>
            <Slider value={[multLocal ?? msug.suggested]} min={msug.min} max={msug.max} step={0.1}
              onValueChange={(v) => setMultLocal(v[0])} onValueCommit={(v) => commitMult(v[0])} data-testid="multiple-slider" />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
              <span>{msug.min}× (conservador)</span>
              <span>sugerido para o setor: <span className="text-foreground">{msug.suggested}×</span></span>
              <span>{msug.max}× (otimista)</span>
            </div>
            {vmethod === "ebitda" && vinfo.ebitda != null && (
              <p className="text-[11px] text-muted-foreground mt-3">EBITDA usado: <span className="text-foreground">{fmt(sym, vinfo.ebitda)}</span> ({vinfo.ebitda_source}).</p>
            )}
            {vmethod === "ebitda" && vinfo.ebitda == null && (
              <p className="text-[11px] text-[#F59E0B] mt-3">Sem EBITDA disponível — preencha os custos no Perfil Financeiro ou carregue um documento oficial para usar este método com rigor.</p>
            )}
          </div>
        )}
      </div>

      {/* Património vs Valor */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10" data-testid="meta-value-vs-networth">
        <StatCard testid="meta-networth" Icon={Wallet} label="Património Líquido (ativos − passivos)" color="#A78BFA"
          value={fmt(sym, data.net_worth)} sub="Base contabilística — não é o valor de mercado." />
        <StatCard testid="meta-current-value" Icon={Target} label="Valor Estimado da Empresa" color="#3B82F6"
          value={fmt(sym, data.current_value)}
          sub={vmethod === "revenue" ? `múltiplo de faturação ${vinfo.used_multiple}×`
            : vmethod === "ebitda" ? `múltiplo de EBITDA ${vinfo.used_multiple}×`
            : "motor automático (património + rendimento)"} />
      </div>

      {!cfg ? (
        <div className="surface rounded-3xl p-8 text-center text-muted-foreground" data-testid="meta-empty">
          Defina o valor que pretende alcançar e o prazo acima, e eu faço a engenharia inversa: quanto precisa de faturar, lucrar e crescer para lá chegar.
        </div>
      ) : (
        <>
          {/* Resumo principal */}
          <div className="grid md:grid-cols-3 gap-4 mb-6" data-testid="meta-summary">
            <div className="surface rounded-2xl p-5 border border-[#10B981]/25" data-testid="summary-goal">
              <div className="text-xs uppercase tracking-wider text-[#10B981] mb-1">Valor alcançando a meta</div>
              <div className="font-serif-lux text-3xl text-[#10B981]">{fmt(sym, data.target_value)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">em {data.years_left} anos</div>
            </div>
            <div className="surface rounded-2xl p-5" data-testid="summary-pace">
              <div className="text-xs uppercase tracking-wider text-[#F59E0B] mb-1">Mantendo o ritmo atual</div>
              <div className="font-serif-lux text-3xl text-[#F59E0B]">{fmt(sym, data.projected_pace)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">crescimento ~{fmt(sym, data.pace_growth_per_year)}/ano</div>
            </div>
            <div className="surface rounded-2xl p-5" data-testid="summary-difference">
              <div className="text-xs uppercase tracking-wider text-[#3B82F6] mb-1">Diferença — Oportunidade</div>
              <div className="font-serif-lux text-3xl text-[#3B82F6]">{fmt(sym, Math.max(0, data.difference))}</div>
              <div className="text-[11px] text-muted-foreground mt-1">quanto vale acelerar</div>
            </div>
          </div>

          {/* Mensagem + viabilidade */}
          <div className="surface rounded-2xl p-5 mb-10 flex items-start gap-4 flex-wrap" data-testid="meta-obstacle">
            <div className="flex-1 min-w-[240px]"><div className="text-sm text-foreground">{data.obstacle?.message}</div></div>
            {viab && (
              <span data-testid="meta-viability" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border shrink-0"
                style={{ color: viab.color, borderColor: `${viab.color}55`, background: `${viab.color}12` }}>
                <viab.Icon className="w-3.5 h-3.5" /> {data.viability.label}
              </span>
            )}
          </div>

          {/* Barra de ações: relatório + alerta */}
          <div className="flex flex-wrap gap-3 mb-10" data-print-hide data-testid="meta-actions-bar">
            <Button data-testid="report-btn" onClick={printReport} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
              <FileDown className="w-4 h-4 mr-2" /> Ver Relatório Completo
            </Button>
            <Button data-testid="notify-btn" onClick={notifyEmail} disabled={notifying} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
              {notifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />} Avisar-me por email
            </Button>
            <Button data-testid="share-btn" onClick={share} disabled={sharing} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
              {sharing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Share2 className="w-4 h-4 mr-2" />} Partilhar meta
            </Button>
          </div>
          {shareUrl && (
            <div className="surface rounded-2xl p-4 mb-10 flex items-center gap-3 flex-wrap" data-print-hide data-testid="share-box">
              <span className="text-xs text-muted-foreground shrink-0">Link só de leitura para sócios/contabilista:</span>
              <input readOnly value={shareUrl} data-testid="share-url" onFocus={(e) => e.target.select()}
                className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" />
              <Button data-testid="share-copy" onClick={copyShare} size="sm" variant="outline" className="rounded-full border-white/15"><Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar</Button>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" data-testid="share-open" className="inline-flex items-center gap-1.5 text-sm text-[#3B82F6] hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a>
            </div>
          )}

          {/* GRÁFICO */}
          <div className="surface rounded-3xl p-6 md:p-8 mb-10" data-testid="meta-chart">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <h3 className="font-serif-lux text-2xl flex items-center gap-2"><LineChart className="w-5 h-5 text-[#3B82F6]" /> Trajetória do valor da empresa</h3>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#10B981]" /> Alcançando a meta</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#F59E0B]" /> Mantendo o ritmo atual</span>
                {sim && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#3B82F6]" /> Com os meus ajustes</span>}
              </div>
            </div>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <RLineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickFormatter={(v) => `${sym}${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}k`} width={64} />
                  <Tooltip content={<ChartTooltip sym={sym} />} />
                  <Line type="monotone" dataKey="goal" name="Alcançando a meta" stroke="#10B981" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="pace" name="Ritmo atual" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  {sim && <Line type="monotone" dataKey="mine" name="Com os meus ajustes" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />}
                </RLineChart>
              </ResponsiveContainer>
            </div>
            {sim && (
              <div className="flex items-center justify-between flex-wrap gap-3 mt-4 pt-4 border-t border-white/[0.06] text-sm">
                <span className="text-muted-foreground">No último ano — meta {fmt(sym, data.target_value)} · com os teus ajustes <span className="text-[#3B82F6] font-medium">{fmt(sym, sim.end.value)}</span></span>
                <span data-testid="chart-diff" className="text-muted-foreground">Diferença: <span className="font-medium text-foreground">{fmt(sym, Math.abs(data.target_value - sim.end.value))}</span></span>
              </div>
            )}
          </div>

          {/* CENÁRIOS */}
          {base?.revenue ? (
            <>
              <h3 className="font-serif-lux text-2xl mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#3B82F6]" /> Cenários</h3>
              <div className="grid md:grid-cols-3 gap-4 mb-10" data-testid="meta-scenarios">
                {SCEN.map((sc) => {
                  const r = scenarioEndValue(sc.key);
                  const active = scenario === sc.key;
                  return (
                    <button key={sc.key} data-testid={`scenario-${sc.key}`} onClick={() => applyScenario(sc.key)}
                      className={`text-left surface rounded-2xl p-5 border transition-all ${active ? "border-2" : "border-white/[0.06] hover:border-white/20"}`}
                      style={active ? { borderColor: sc.color } : {}}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium" style={{ color: sc.color }}>{sc.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{sc.diff}</span>
                      </div>
                      <div className="font-serif-lux text-2xl mb-3">{r ? fmt(sym, r.value) : "—"}</div>
                      {r && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>Faturação: <span className="text-foreground">{fmt(sym, r.rev)}/ano</span></div>
                          <div>Mensal: <span className="text-foreground">{fmt(sym, r.monthly)}/mês</span></div>
                          <div>Lucro: <span className="text-foreground">{fmt(sym, r.profit)}/ano</span></div>
                          <div>Margem: <span className="text-foreground">{r.margin}%</span> · Cresc.: <span className="text-foreground">{r.growth}%/ano</span></div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* SLIDERS */}
              <div className="surface rounded-3xl p-6 md:p-8 mb-10" data-testid="meta-sliders">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                  <h3 className="font-serif-lux text-2xl flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-[#3B82F6]" /> Ajuste de cenários</h3>
                  {sim && (
                    <span data-testid="sim-viability" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border"
                      style={{ color: simViab.color, borderColor: `${simViab.color}55`, background: `${simViab.color}12` }}>
                      <simViab.Icon className="w-3.5 h-3.5" /> Probabilidade: {Math.round(sim.reachPct)}% da meta
                    </span>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-x-10 gap-y-7">
                  {SLIDERS.map((sl) => (
                    <div key={sl.key} data-testid={`slider-${sl.key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm">{sl.label}</Label>
                        <span className="text-sm font-medium text-[#3B82F6]">{s[sl.key]}{sl.suffix}</span>
                      </div>
                      <Slider value={[s[sl.key]]} min={sl.min} max={sl.max} step={sl.step}
                        onValueChange={(v) => { setS((p) => ({ ...p, [sl.key]: v[0] })); setScenario("custom"); }} />
                      <div className="text-[11px] text-muted-foreground mt-1.5">{sl.hint}</div>
                    </div>
                  ))}
                </div>
                {sim && (
                  <div className="grid sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/[0.06]">
                    <div><div className="text-xs text-muted-foreground mb-1">Valor projetado</div><div className="font-serif-lux text-2xl text-[#3B82F6]" data-testid="sim-value">{fmt(sym, sim.end.value)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">Faturação necessária</div><div className="font-serif-lux text-2xl">{fmt(sym, sim.end.rev)}/ano</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">Lucro projetado</div><div className="font-serif-lux text-2xl text-[#10B981]">{fmt(sym, sim.end.profit)}/ano</div></div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="surface rounded-2xl p-6 text-center text-muted-foreground mb-10" data-testid="scenarios-locked">
              Preencha a faturação no <span className="text-[#3B82F6]">Perfil Financeiro</span> para simular cenários e ajustar parâmetros.
            </div>
          )}

          {/* PLANO ANUAL */}
          {sim && (
            <div className="surface rounded-3xl p-6 md:p-8 mb-10 overflow-x-auto" data-testid="meta-annual-plan">
              <h3 className="font-serif-lux text-2xl flex items-center gap-2 mb-5"><Table2 className="w-5 h-5 text-[#3B82F6]" /> Plano ano a ano</h3>
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-white/[0.08]">
                    <th className="py-2 pr-4">Ano</th>
                    <th className="py-2 pr-4">Faturação</th>
                    <th className="py-2 pr-4">Lucro líq.</th>
                    <th className="py-2 pr-4">Margem</th>
                    <th className="py-2 pr-4">EBITDA*</th>
                    <th className="py-2 pr-4">Dívida</th>
                    <th className="py-2 pr-4">Valor empresa</th>
                    <th className="py-2 pr-4">% meta</th>
                    <th className="py-2">Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.rows.map((r) => {
                    const pctMeta = data.target_value ? Math.round((r.value / data.target_value) * 100) : 0;
                    const ebitda = r.profit / 0.7;
                    const priority = s.margin < 10 ? "Aumentar margem"
                      : r.k <= 1 ? "Consolidar a base"
                      : r.value / data.target_value < 0.5 ? "Acelerar vendas"
                      : "Escalar e proteger margem";
                    return (
                      <tr key={r.k} className="border-b border-white/[0.04]" data-testid={`plan-row-${r.k}`}>
                        <td className="py-2.5 pr-4 font-medium">Ano {r.k}</td>
                        <td className="py-2.5 pr-4">{fmt(sym, r.rev)}</td>
                        <td className="py-2.5 pr-4 text-[#10B981]">{fmt(sym, r.profit)}</td>
                        <td className="py-2.5 pr-4">{s.margin}%</td>
                        <td className="py-2.5 pr-4">{fmt(sym, ebitda)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{fmt(sym, r.debt)}</td>
                        <td className="py-2.5 pr-4 font-medium text-[#3B82F6]">{fmt(sym, r.value)}</td>
                        <td className="py-2.5 pr-4">{pctMeta}%</td>
                        <td className="py-2.5 text-muted-foreground">{priority}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3">*EBITDA estimado (aproximação a partir do lucro líquido; não substitui a demonstração de resultados real).</p>
            </div>
          )}

          {/* O que precisa de fazer (engenharia inversa) */}
          <h3 className="font-serif-lux text-2xl mb-4 flex items-center gap-2"><Flag className="w-5 h-5 text-[#3B82F6]" /> O que precisa de fazer para alcançar a meta</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4" data-testid="meta-actions">
            <StatCard testid="action-profit" Icon={TrendingUp} color="#10B981" label="Lucro líquido necessário"
              value={req.required_profit != null ? `${fmt(sym, req.required_profit)}/ano` : "—"} />
            <StatCard testid="action-revenue" Icon={ArrowUpRight} color="#3B82F6" label="Faturação necessária"
              value={req.required_revenue != null ? `${fmt(sym, req.required_revenue)}/ano` : "—"} />
            <StatCard testid="action-monthly" Icon={ArrowUpRight} color="#3B82F6" label="Faturação mensal necessária"
              value={req.required_monthly_revenue != null ? `${fmt(sym, req.required_monthly_revenue)}/mês` : "—"} />
            <StatCard testid="action-growth" Icon={TrendingUp} color="#A78BFA" label="Crescimento necessário"
              value={req.required_growth_total != null ? `+${req.required_growth_total}%` : "—"}
              sub={req.required_growth_annual != null ? `~${req.required_growth_annual}%/ano` : null} />
            <StatCard testid="action-margin" Icon={Percent} color="#F59E0B" label="Margem necessária"
              value={req.assumed_margin != null ? `${req.assumed_margin}%` : "—"}
              sub={req.margin_assumed ? "assumida (falta margem real)" : "manter a margem atual"} />
            <StatCard testid="action-monthly-diff" Icon={ArrowUpRight} color="#3B82F6" label="Diferença mensal"
              value={req.monthly_diff != null ? `${req.monthly_diff >= 0 ? "+" : ""}${fmt(sym, req.monthly_diff)}/mês` : "—"} />
          </div>

          {/* GPS estratégico */}
          <div className="surface rounded-3xl p-6 md:p-8 mt-8 mb-10" data-testid="meta-gps">
            <h3 className="font-serif-lux text-2xl flex items-center gap-2 mb-6"><MapPin className="w-5 h-5 text-[#3B82F6]" /> GPS estratégico</h3>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div><div className="text-xs text-muted-foreground mb-1">Está aqui</div><div className="font-medium text-lg">{fmt(sym, data.current_value)}</div></div>
              <div><div className="text-xs text-muted-foreground mb-1">Se mantiver o ritmo</div><div className="font-medium text-lg text-[#F59E0B]">{fmt(sym, data.projected_pace)}</div></div>
              <div><div className="text-xs text-muted-foreground mb-1">Meta escolhida</div><div className="font-medium text-lg text-[#10B981]">{fmt(sym, data.target_value)}</div></div>
            </div>
            <ProgressBar pct={data.progress} color="#3B82F6" />
            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground mt-2">
              <span data-testid="gps-progress">{data.progress}% já alcançado</span>
              <span>Falta {fmt(sym, Math.max(0, data.target_value - data.current_value))}</span>
              <span>{data.years_left} anos restantes</span>
            </div>
          </div>

          {/* Perspetiva do CEO AI 2.0 */}
          <div className="surface rounded-3xl p-6 md:p-8" data-testid="ceo-plan-section">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <h3 className="font-serif-lux text-2xl flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#3B82F6]" /> Perspetiva do CEO AI 2.0</h3>
              <Button data-testid="generate-plan-btn" onClick={generatePlan} disabled={planLoading} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
                {planLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {plan ? "Gerar de novo" : "Pedir perspetiva do CEO"}
              </Button>
            </div>
            {!plan && !planLoading && <p className="text-muted-foreground text-sm">Carregue no botão e eu analiso os seus números reais e o seu setor para lhe dizer exatamente o que fazer para chegar à meta no prazo.</p>}
            {plan && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 mt-2" data-testid="ceo-plan">
                {plan.veredicto && <div className="text-lg font-medium text-[#3B82F6]" data-testid="plan-verdict">{plan.veredicto}</div>}
                {plan.diagnostico && <p className="text-muted-foreground" data-testid="plan-diagnostic">{plan.diagnostico}</p>}
                {Array.isArray(plan.acoes) && (
                  <div className="space-y-3">
                    {plan.acoes.map((a, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]" data-testid={`plan-action-${i}`}>
                        <div className="w-6 h-6 rounded-lg bg-[#3B82F6]/15 text-[#3B82F6] flex items-center justify-center text-sm font-semibold shrink-0">{i + 1}</div>
                        <div className="flex-1">
                          <div className="font-medium">{a.acao}</div>
                          {a.impacto && <div className="text-sm text-[#10B981] mt-0.5">Impacto: {a.impacto}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {plan.frase && <p className="italic text-foreground/80 border-l-2 border-[#3B82F6] pl-4" data-testid="plan-phrase">{plan.frase}</p>}
              </motion.div>
            )}
          </div>

          {/* Como foi calculado */}
          <div className="surface rounded-3xl p-6 md:p-8 mt-8" data-testid="how-calculated">
            <button onClick={() => setHowOpen((o) => !o)} data-testid="how-calculated-toggle"
              className="w-full flex items-center justify-between text-left" data-print-hide>
              <h3 className="font-serif-lux text-2xl flex items-center gap-2"><Info className="w-5 h-5 text-[#3B82F6]" /> Como foi calculado?</h3>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${howOpen ? "rotate-180" : ""}`} />
            </button>
            <h3 className="font-serif-lux text-2xl items-center gap-2 hidden print:flex"><Info className="w-5 h-5" /> Como foi calculado?</h3>
            <div className={`mt-6 grid md:grid-cols-2 gap-x-10 gap-y-3 text-sm ${howOpen ? "block" : "hidden print:grid"}`}>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Valor estimado atual</span><span className="font-medium">{fmt(sym, data.current_value)}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Património líquido (ativos − passivos)</span><span className="font-medium">{fmt(sym, data.net_worth)}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Faturação anual usada{data.ytd ? " (do que já faturaste este ano)" : ""}</span><span className="font-medium">{data.current_revenue != null ? fmt(sym, data.current_revenue) : "—"}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Lucro anual usado</span><span className="font-medium">{data.current_profit != null ? fmt(sym, data.current_profit) : "—"}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Margem líquida</span><span className="font-medium">{data.current_margin != null ? `${data.current_margin}%` : "—"}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Método / múltiplo aplicado</span><span className="font-medium">{vmethod === "revenue" ? "Faturação" : vmethod === "ebitda" ? "EBITDA" : "Automático"}{vinfo.used_multiple != null ? ` · ${vinfo.used_multiple}×` : ""}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Dívida / passivos</span><span className="font-medium">{fmt(sym, data.total_liabilities)}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Caixa disponível</span><span className="font-medium">{fmt(sym, data.cash)}</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Prazo analisado</span><span className="font-medium">{data.years_left} anos</span></div>
                <div className="flex justify-between border-b border-white/[0.05] py-1.5"><span className="text-muted-foreground">Fonte dos dados</span><span className="font-medium">{data.value_sources?.patrimonio || "Perfil Financeiro"}</span></div>
                <div className="md:col-span-2 mt-3 text-muted-foreground leading-relaxed">
                  <p className="mb-2"><span className="text-foreground font-medium">Método:</span> valor da empresa = base patrimonial (ativos − passivos, quando positiva) + rendimento (lucro anual × múltiplo). O múltiplo (2,0 a 3,5×) sobe com a margem líquida e com o peso das receitas recorrentes — por isso a rentabilidade vale tanto como a faturação.</p>
                  <p className="mb-2"><span className="text-foreground font-medium">Engenharia inversa:</span> a partir da meta de valor e do prazo, resolvemos que lucro/faturação/margem seriam precisos para lá chegar — não é regra de três.</p>
                  <p><span className="text-foreground font-medium">Pressupostos:</span> a projeção "ritmo atual" assume o lucro atual retido ao longo do prazo; os cenários e os sliders assumem crescimento e margem constantes por ano. É uma estimativa, não uma avaliação pericial.</p>
                </div>
              </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-8" data-testid="meta-disclaimer">
            Esta projeção é uma estimativa estratégica baseada nos dados introduzidos e não constitui uma avaliação financeira, contabilística ou jurídica independente.
          </p>
        </>
      )}
    </div>
  );
}
