import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

export default function MetaReport() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get("/goal").then(({ data }) => {
      if (!data.configured) { setFailed(true); return; }
      setD(data);
    }).catch(() => setFailed(true));
  }, []);

  if (failed) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-700 gap-4 px-6 text-center">
      <p>Ainda não há uma meta calculada para gerar o relatório.</p>
      <button onClick={() => navigate("/meta")} className="text-blue-600 underline">Voltar à projeção</button>
    </div>
  );
  if (!d) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  const sym = d.currency_symbol || "€";
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString(sym === "R$" ? "pt-BR" : "pt-PT", { maximumFractionDigits: 0 })}`;
  const req = d.required || {};
  const traj = d.trajectory || [];
  const chartData = traj.map((t) => ({ label: t.label, Meta: t.goal, "Ritmo atual": t.pace }));
  const today = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  const KPI = ({ label, value, sub, color }) => (
    <div style={{ breakInside: "avoid" }} className="rounded-xl border border-gray-200 p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="report-root min-h-screen bg-gray-100 py-10 print:py-0 print:bg-white">
      {/* Toolbar (não imprime) */}
      <div data-print-hide className="max-w-[794px] mx-auto mb-4 flex items-center justify-between px-2">
        <button onClick={() => navigate("/meta")} data-testid="report-back" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={() => window.print()} data-testid="report-print" className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white rounded-full px-5 py-2.5 hover:bg-blue-700">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* Folha A4 */}
      <div className="report-sheet bg-white text-gray-900 mx-auto shadow-xl print:shadow-none" style={{ width: "794px", maxWidth: "100%", padding: "48px 56px" }}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-5 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">C</div>
            <div>
              <div className="text-lg font-bold leading-none">CEO AI 2.0</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500 mt-1">Diretor Executivo Digital</div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Relatório de Projeção de Valor</div>
            <div>{today}</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-1">Projeção de Valor da Empresa</h1>
        <p className="text-gray-500 mb-8">Meta de valor da empresa · prazo de {d.years_left} anos</p>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <KPI label="Valor estimado atual" value={fmt(d.current_value)} sub={`${d.progress}% da meta`} color="#2563EB" />
          <KPI label="Meta de valor" value={fmt(d.target_value)} sub={`em ${d.years_left} anos`} color="#059669" />
          <KPI label="Mantendo o ritmo atual" value={fmt(d.projected_pace)} sub="projeção no prazo" color="#D97706" />
          <KPI label="Património líquido" value={fmt(d.net_worth)} sub="ativos − passivos" color="#7C3AED" />
          <KPI label="Faturação anual usada" value={d.current_revenue != null ? fmt(d.current_revenue) : "—"} sub={d.ytd ? "do que já faturou este ano" : "perfil / documentos"} color="#111827" />
          <KPI label="Margem líquida" value={d.current_margin != null ? `${d.current_margin}%` : "—"} sub={(() => { const v = d.valuation || {}; const m = v.method === "revenue" ? "faturação" : v.method === "ebitda" ? "EBITDA" : "automático"; return `método ${m}${v.used_multiple != null ? ` · ${v.used_multiple}×` : ""}`; })()} color="#111827" />
        </div>

        {/* Progresso */}
        <div style={{ breakInside: "avoid" }} className="rounded-xl border border-gray-200 p-5 mb-8">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-gray-900">{d.progress}% alcançado</span>
            <span className="text-gray-500">Falta {fmt(Math.max(0, (d.target_value || 0) - (d.current_value || 0)))}</span>
            <span className="font-medium" style={{ color: d.viability?.level === "green" ? "#059669" : d.viability?.level === "red" ? "#DC2626" : "#D97706" }}>{d.viability?.label}</span>
          </div>
          <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, d.progress || 0)}%` }} />
          </div>
        </div>

        {/* Gráfico (tamanho fixo, legível) */}
        {chartData.length > 1 && (
          <div style={{ breakInside: "avoid" }} className="mb-8">
            <h2 className="text-lg font-bold mb-3">Trajetória do valor da empresa</h2>
            <div className="rounded-xl border border-gray-200 p-4 flex justify-center">
              <RLineChart width={620} height={280} data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={13} tickMargin={8} />
                <YAxis stroke="#6b7280" fontSize={12} width={70}
                  tickFormatter={(v) => `${sym}${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}k`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line type="monotone" dataKey="Meta" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="Ritmo atual" stroke="#D97706" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false} />
              </RLineChart>
            </div>
          </div>
        )}

        {/* O que é preciso */}
        <div style={{ breakInside: "avoid" }} className="mb-8">
          <h2 className="text-lg font-bold mb-3">O que é preciso para alcançar a meta</h2>
          <div className="grid grid-cols-3 gap-3">
            <KPI label="Faturação necessária" value={req.required_revenue != null ? `${fmt(req.required_revenue)}/ano` : "—"} color="#2563EB" />
            <KPI label="Faturação mensal" value={req.required_monthly_revenue != null ? `${fmt(req.required_monthly_revenue)}/mês` : "—"} color="#2563EB" />
            <KPI label="Lucro líquido necessário" value={req.required_profit != null ? `${fmt(req.required_profit)}/ano` : "—"} color="#059669" />
            <KPI label="Margem necessária" value={req.assumed_margin != null ? `${req.assumed_margin}%` : "—"} color="#D97706" />
            <KPI label="Crescimento necessário" value={req.required_growth_total != null ? `+${req.required_growth_total}%` : "—"} sub={req.required_growth_annual != null ? `~${req.required_growth_annual}%/ano` : null} color="#7C3AED" />
            <KPI label="Diferença mensal" value={req.monthly_diff != null ? `${req.monthly_diff >= 0 ? "+" : ""}${fmt(req.monthly_diff)}/mês` : "—"} color="#2563EB" />
          </div>
          {d.obstacle?.message && <p className="text-sm text-gray-600 mt-4">{d.obstacle.message}</p>}
        </div>

        {/* Plano ano a ano (valor projetado até à meta) */}
        {traj.length > 1 && (
          <div style={{ breakInside: "avoid" }} className="mb-8">
            <h2 className="text-lg font-bold mb-3">Plano ano a ano</h2>
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider">
                  <th className="text-left py-2.5 px-3">Período</th>
                  <th className="text-right py-2.5 px-3">Valor da empresa (rumo à meta)</th>
                  <th className="text-right py-2.5 px-3">Ritmo atual</th>
                  <th className="text-right py-2.5 px-3">% da meta</th>
                </tr>
              </thead>
              <tbody>
                {traj.map((t, i) => (
                  <tr key={i} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                    <td className="text-left py-2.5 px-3 font-medium">{t.label}</td>
                    <td className="text-right py-2.5 px-3 text-emerald-700 tabular-nums">{fmt(t.goal)}</td>
                    <td className="text-right py-2.5 px-3 text-amber-700 tabular-nums">{fmt(t.pace)}</td>
                    <td className="text-right py-2.5 px-3 tabular-nums">{d.target_value ? Math.round((t.goal / d.target_value) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Como foi calculado */}
        <div style={{ breakInside: "avoid" }} className="mb-6">
          <h2 className="text-lg font-bold mb-3">Como foi calculado</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            <strong>Método:</strong> valor da empresa = base patrimonial (ativos − passivos, quando positiva) + rendimento (lucro anual × múltiplo). O múltiplo (2,0 a 3,5×) sobe com a margem líquida e com o peso das receitas recorrentes.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            <strong>Engenharia inversa:</strong> a partir da meta de valor e do prazo, resolvemos que faturação, lucro e margem seriam precisos para lá chegar — não é regra de três.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>Fonte dos dados:</strong> {d.value_sources?.patrimonio || "Perfil Financeiro"}. <strong>Pressupostos:</strong> a projeção "ritmo atual" assume o lucro atual retido ao longo do prazo.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4 text-[11px] text-gray-400 leading-relaxed">
          Esta projeção é uma estimativa estratégica baseada nos dados da empresa e não constitui uma avaliação financeira, contabilística ou jurídica independente. Gerado pelo CEO AI 2.0 em {today}.
        </div>
      </div>
    </div>
  );
}
