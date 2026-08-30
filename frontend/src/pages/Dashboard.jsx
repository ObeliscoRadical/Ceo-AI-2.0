import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CEOOrb } from "@/components/CEOOrb";
import { motion } from "framer-motion";
import { Loader2, ArrowUpRight, ArrowDownRight, AlertCircle, Sparkles, TrendingDown, Users, Landmark, Receipt, ShieldAlert, MessageSquare, Info } from "lucide-react";

const STATUS_COLORS = { green: "#10B981", amber: "#F59E0B", red: "#EF4444" };
const ICONS = { cash: ArrowUpRight, profit: TrendingDown, clients: Users, tax: Receipt, risk: ShieldAlert, opportunity: Sparkles };

function Ring({ value, max = 100, size = 150, color = "#3B82F6", label, sub }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * pct) / 100 }}
          transition={{ duration: 1.2, ease: "easeOut" }} />
      </svg>
      <div className="absolute text-center">
        <div className="font-serif-lux text-4xl" style={{ color }} data-testid="ring-value">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snap, setSnap] = useState(null);
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setSnap(data)).catch(() => {});
    api.get("/briefing").then(({ data }) => setBrief(data)).catch(() => {}).finally(() => setBriefLoading(false));
  }, []);

  const moodFromHealth = (h) => (h >= 75 ? "emerald" : h >= 45 ? "gold" : "amber");
  const sym = snap?.currency_symbol || "€";

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      {/* Briefing */}
      <div className="glass rounded-3xl p-6 md:p-10 mb-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
        <CEOOrb size={130} mood={snap ? moodFromHealth(snap.health) : "gold"} className="shrink-0" />
        <div className="flex-1 min-w-0">
          {briefLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> O CEO AI 2.0 está a preparar o seu briefing...</div>
          ) : (
            <>
              <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-serif-lux text-3xl md:text-4xl leading-tight mb-6" data-testid="briefing-greeting">
                {brief?.greeting || `Bom dia, ${user?.name}.`}
              </motion.h1>
              <div className="space-y-3">
                {(brief?.items || []).map((it, i) => {
                  const Icon = ICONS[it.icon] || AlertCircle;
                  const pc = it.priority === "alta" ? "#EF4444" : it.priority === "media" ? "#F59E0B" : "#10B981";
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}
                      className="flex gap-4 p-4 rounded-xl bg-[hsl(var(--card))]/60 border border-border" data-testid={`briefing-item-${i}`}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${pc}22`, color: pc }}>
                        <Icon className="w-[18px] h-[18px]" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{it.title}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{it.detail}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <button onClick={() => navigate("/ceo")} data-testid="ask-ceo-btn"
                className="mt-6 inline-flex items-center gap-2 text-sm text-[#3B82F6] hover:gap-3 transition-all">
                <MessageSquare className="w-4 h-4" /> Falar com o CEO AI 2.0
              </button>
            </>
          )}
        </div>
      </div>

      {!snap ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Health */}
            <div className="surface rounded-3xl p-8 flex flex-col items-center justify-center" data-testid="health-card">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">Saúde da Empresa</p>
              <Ring value={snap.health} color={STATUS_COLORS[snap.health >= 75 ? "green" : snap.health >= 45 ? "amber" : "red"]} label={snap.health} sub="de 100" />
            </div>
            {/* Balance / Património */}
            <div className="surface rounded-3xl p-8 md:col-span-2" data-testid="value-card">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Balanço &amp; Património</p>
                {!snap.has_balance && <span className="text-[11px] text-amber-400" data-testid="fill-balance-hint">Preenche o Perfil Financeiro em Finanças →</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <BalTile label="Caixa disponível" value={`${sym}${Number(snap.cash_available).toLocaleString("pt-PT")}`} color="#3B82F6" testid="bal-cash" />
                <BalTile label="Total de ativos" value={`${sym}${Number(snap.total_assets).toLocaleString("pt-PT")}`} color="#10B981" testid="bal-assets" />
                <BalTile label="Total de passivos" value={`${sym}${Number(snap.total_liabilities).toLocaleString("pt-PT")}`} color="#EF4444" testid="bal-liabilities" />
                <BalTile label="Património líquido" value={`${sym}${Number(snap.net_worth).toLocaleString("pt-PT")}`} color={snap.net_worth >= 0 ? "#3B82F6" : "#EF4444"} tip="Corresponde ao total de ativos menos o total de passivos registados." testid="company-value" />
                <BalTile label="Valor estimado da empresa" value="Avaliação ainda não calculada" small color="#94a3b8" tip="Estimativa baseada em desempenho, risco, crescimento, dívida e múltiplos de mercado. Pode ser diferente do património líquido." testid="bal-estimated" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-4">O património líquido = total de ativos − total de passivos. Não representa necessariamente o preço de venda da empresa.</p>
            </div>
          </div>

          {/* Vital signs */}
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">Sinais Vitais</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {snap.vitals.map((v, i) => (
              <motion.div key={v.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                className="surface rounded-2xl p-5 relative overflow-hidden" data-testid={`vital-${v.key}`}>
                <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[v.status], boxShadow: `0 0 10px ${STATUS_COLORS[v.status]}` }} />
                <p className="text-xs text-muted-foreground mb-3">{v.label}</p>
                <div className="font-serif-lux text-2xl" style={{ color: STATUS_COLORS[v.status] }}>
                  {v.unit === "€" || v.unit === "R$" ? `${v.unit}${Number(v.value).toLocaleString("pt-PT")}` : `${v.value}${v.unit ? " " + v.unit : ""}`}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{v.hint}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BalTile({ label, value, color, tip, small, testid }) {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4" title={tip || ""} data-testid={testid}>
      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">{label}{tip ? <Info className="w-3 h-3 opacity-60" /> : null}</p>
      <div className={`font-serif-lux ${small ? "text-sm leading-snug" : "text-2xl"}`} style={{ color }}>{value}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-medium mt-0.5">{value}</div>
    </div>
  );
}
