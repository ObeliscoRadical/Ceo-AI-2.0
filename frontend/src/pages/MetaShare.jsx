import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Loader2, Target, LineChart, TrendingUp, CheckCircle2, Clock, AlertTriangle, Wallet, MapPin } from "lucide-react";

const VIAB = {
  green: { color: "#10B981", Icon: CheckCircle2 },
  amber: { color: "#F59E0B", Icon: Clock },
  red: { color: "#EF4444", Icon: AlertTriangle },
};

export default function MetaShare() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get(`/goal/share/${token}`).then(({ data }) => setD(data)).catch(() => setFailed(true));
  }, [token]);

  if (failed) return (
    <div className="min-h-screen flex items-center justify-center bg-[#05050A] text-muted-foreground px-6 text-center">
      Este link de partilha já não está disponível.
    </div>
  );
  if (!d) return <div className="min-h-screen flex items-center justify-center bg-[#05050A]"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;

  const g = d.data || {};
  const sym = g.currency_symbol || "€";
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString(sym === "R$" ? "pt-BR" : "pt-PT", { maximumFractionDigits: 0 })}`;
  const req = g.required || {};
  const viab = g.viability ? (VIAB[g.viability.level] || VIAB.amber) : null;
  const chartData = (g.trajectory || []).map((t) => ({ label: t.label, goal: t.goal, pace: t.pace }));
  const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" }) : "";

  return (
    <div className="min-h-screen bg-[#05050A] text-white grain" data-testid="meta-share-page">
      <div className="max-w-[900px] mx-auto px-6 md:px-10 py-12 md:py-16">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-[#3B82F6] flex items-center justify-center">
            <LineChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-serif-lux text-lg leading-none">CEO AI 2.0</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-0.5">Diretor Executivo Digital</div>
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">Meta de Valor da Empresa</p>
        <h1 className="font-serif-lux text-3xl md:text-4xl text-[#3B82F6] flex items-center gap-3 mb-1">
          <Target className="w-7 h-7" /> {d.company_name}
        </h1>
        <p className="text-muted-foreground mb-10">Resumo da meta e do progresso {d.owner_name ? `· ${d.owner_name}` : ""}</p>

        {/* Resumo */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="surface rounded-2xl p-5 border border-[#10B981]/25">
            <div className="text-xs uppercase tracking-wider text-[#10B981] mb-1">Meta de valor</div>
            <div className="font-serif-lux text-3xl text-[#10B981]" data-testid="share-target">{fmt(g.target_value)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">em {g.years_left} anos</div>
          </div>
          <div className="surface rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-[#3B82F6] mb-1">Valor atual estimado</div>
            <div className="font-serif-lux text-3xl text-[#3B82F6]" data-testid="share-current">{fmt(g.current_value)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{g.progress}% da meta</div>
          </div>
          <div className="surface rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-[#F59E0B] mb-1">Mantendo o ritmo atual</div>
            <div className="font-serif-lux text-3xl text-[#F59E0B]" data-testid="share-pace">{fmt(g.projected_pace)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">projeção no prazo</div>
          </div>
        </div>

        {/* Progresso */}
        <div className="surface rounded-2xl p-5 mb-6">
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, g.progress || 0)}%`, background: "#3B82F6" }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
            <span><span className="text-foreground font-medium">{g.progress}%</span> alcançado</span>
            <span>Falta {fmt(Math.max(0, (g.target_value || 0) - (g.current_value || 0)))}</span>
            {viab && (
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: viab.color }}>
                <viab.Icon className="w-3.5 h-3.5" /> {g.viability.label}
              </span>
            )}
          </div>
        </div>

        {/* Gráfico */}
        {chartData.length > 1 && (
          <div className="surface rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="font-serif-lux text-xl flex items-center gap-2"><LineChart className="w-4 h-4 text-[#3B82F6]" /> Trajetória do valor</h2>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#10B981]" /> Meta</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#F59E0B]" /> Ritmo atual</span>
              </div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <RLineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickFormatter={(v) => `${sym}${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}k`} width={60} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#0A0A12", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="goal" name="Meta" stroke="#10B981" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="pace" name="Ritmo atual" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </RLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* O que é preciso */}
        <div className="surface rounded-2xl p-5 md:p-6 mb-6">
          <h2 className="font-serif-lux text-xl mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#3B82F6]" /> O que é preciso para chegar à meta</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-muted-foreground">Faturação necessária</div><div className="font-medium text-lg">{req.required_revenue != null ? `${fmt(req.required_revenue)}/ano` : "—"}</div></div>
            <div><div className="text-muted-foreground">Faturação mensal</div><div className="font-medium text-lg">{req.required_monthly_revenue != null ? `${fmt(req.required_monthly_revenue)}/mês` : "—"}</div></div>
            <div><div className="text-muted-foreground">Lucro líquido necessário</div><div className="font-medium text-lg text-[#10B981]">{req.required_profit != null ? `${fmt(req.required_profit)}/ano` : "—"}</div></div>
            <div><div className="text-muted-foreground">Margem necessária</div><div className="font-medium text-lg">{req.assumed_margin != null ? `${req.assumed_margin}%` : "—"}</div></div>
            <div><div className="text-muted-foreground">Crescimento necessário</div><div className="font-medium text-lg">{req.required_growth_total != null ? `+${req.required_growth_total}%` : "—"}</div></div>
            <div><div className="text-muted-foreground">Património líquido</div><div className="font-medium text-lg text-[#A78BFA]">{fmt(g.net_worth)}</div></div>
          </div>
          {g.obstacle?.message && <p className="text-sm text-muted-foreground mt-5 pt-4 border-t border-white/[0.06]">{g.obstacle.message}</p>}
        </div>

        {/* GPS */}
        <div className="surface rounded-2xl p-5 md:p-6 mb-8">
          <h2 className="font-serif-lux text-xl mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-[#3B82F6]" /> Onde está e onde quer chegar</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-muted-foreground mb-1">Está aqui</div><div className="font-medium text-lg">{fmt(g.current_value)}</div></div>
            <div><div className="text-muted-foreground mb-1">Se mantiver o ritmo</div><div className="font-medium text-lg text-[#F59E0B]">{fmt(g.projected_pace)}</div></div>
            <div><div className="text-muted-foreground mb-1">Meta</div><div className="font-medium text-lg text-[#10B981]">{fmt(g.target_value)}</div></div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {updated && <>Atualizado a {updated}. </>}
          Esta projeção é uma estimativa estratégica baseada nos dados da empresa e não constitui uma avaliação financeira, contabilística ou jurídica independente. Gerado pelo CEO AI 2.0.
        </p>
      </div>
    </div>
  );
}
