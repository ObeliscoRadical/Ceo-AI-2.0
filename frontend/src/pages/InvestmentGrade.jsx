import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAppData } from "@/context/AppDataContext";
import { CEOOrb } from "@/components/CEOOrb";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Crown, Check, ShieldCheck, Info, TrendingUp, ArrowUpRight, Circle, CheckCircle2, Upload, FileSearch } from "lucide-react";
import { motion } from "framer-motion";

const gradeColor = (g) => {
  if (!g) return "#A1A1AA";
  const l = g[0];
  if (l === "A") return "#10B981";
  if (l === "B") return "#3B82F6";
  if (l === "C") return "#F59E0B";
  return "#EF4444";
};

const TIER_COLOR = { "Nível Profissional": "#10B981", "Estimativa Fundamentada": "#3B82F6", "Estimativa Inteligente": "#F59E0B" };

function GradeBadge({ grade, size = 180 }) {
  const color = gradeColor(grade);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute rounded-full" style={{ width: size, height: size, background: `radial-gradient(circle at 40% 35%, ${color}33, transparent 70%)`, filter: "blur(6px)" }} />
      <div className="absolute rounded-full border-2" style={{ width: size * 0.82, height: size * 0.82, borderColor: `${color}55` }} />
      <div className="font-serif-lux" style={{ fontSize: size * 0.42, color, lineHeight: 1 }} data-testid="overall-grade">{grade}</div>
    </div>
  );
}

export default function InvestmentGrade() {
  const { isPremium } = useAppData();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState(null);
  const fileRef = useRef(null);
  const pendingType = useRef(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/investment-grade");
    setData(data);
  }, []);

  useEffect(() => {
    if (isPremium) load().catch(() => {}).finally(() => setLoading(false));
    else setLoading(false);
  }, [isPremium, load]);

  const pickFile = (type) => { pendingType.current = type; fileRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    const type = pendingType.current;
    if (!file || !type) return;
    setUploadingType(type);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", type);
    try {
      await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
      toast.success("Documento carregado — avaliação atualizada.");
    } catch {
      toast.error("Não foi possível carregar o documento");
    } finally {
      setUploadingType(null);
      pendingType.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!isPremium) {
    return (
      <div className="p-6 md:p-10 max-w-[900px] mx-auto">
        <div className="surface rounded-3xl p-12 text-center" data-testid="grade-paywall">
          <div className="flex justify-center mb-6"><CEOOrb size={110} mood="gold" /></div>
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#3B82F6] mb-3"><Crown className="w-4 h-4" /> Funcionalidade Premium</span>
          <h1 className="font-serif-lux text-4xl mb-3">Relatório de Investimento</h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8">Um rating profissional da tua empresa (A+, B, C...) que explica <strong>porque</strong> vale o que vale — e exatamente <strong>o que fazer</strong> para valer mais.</p>
          <Button data-testid="unlock-grade-btn" onClick={() => navigate("/planos")} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] px-8 py-6 font-medium">
            <Crown className="w-4 h-4 mr-2" /> Desbloquear Premium
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !data) return <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;

  const sym = data.currency_symbol;
  const tierColor = TIER_COLOR[data.confidence.tier] || "#3B82F6";

  return (
    <div className="p-6 md:p-10 max-w-[1320px] mx-auto">
      <h1 className="font-serif-lux text-4xl mb-1">Relatório de Investimento</h1>
      <p className="text-muted-foreground text-sm mb-8">Rating da tua empresa, ao estilo de uma agência de investimento.</p>

      {/* Hero */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        <div className="surface rounded-3xl p-8 flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">Investment Grade</p>
          <GradeBadge grade={data.overall_grade} />
          <p className="text-sm text-muted-foreground mt-2">Score global {data.overall_score}/100</p>
        </div>
        <div className="surface rounded-3xl p-8 md:col-span-2 flex flex-col justify-center">
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-3">Valor Estimado da Empresa</p>
          <div className="font-serif-lux text-5xl text-[#3B82F6]" data-testid="grade-value">{sym}{Number(data.company_value).toLocaleString("pt-PT")}</div>
          <p className="text-sm text-muted-foreground mt-2">Intervalo: {sym}{Number(data.value_range.low).toLocaleString("pt-PT")} – {sym}{Number(data.value_range.high).toLocaleString("pt-PT")}</p>
          <div className="mt-5 p-4 rounded-xl border" style={{ borderColor: `${tierColor}44`, background: `${tierColor}12` }} data-testid="confidence-banner">
            <div className="flex items-center gap-2" style={{ color: tierColor }}>
              <ShieldCheck className="w-4 h-4" />
              <span className="text-sm font-medium">{data.confidence.tier}</span>
              <span className="text-xs text-muted-foreground ml-1">· {data.confidence.score}% dos dados formais</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{data.disclaimer}</p>
          </div>
        </div>
      </div>

      {/* Rationale */}
      <div className="surface rounded-3xl p-8 mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-3">Porque vale este valor</p>
        <p className="text-lg leading-relaxed font-serif-lux" data-testid="grade-rationale">{data.rationale}</p>
      </div>

      {/* Dimensions */}
      <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">Rating por Dimensão</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {data.dimensions.map((d, i) => (
          <motion.div key={d.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="surface rounded-2xl p-5" data-testid={`grade-dim-${d.key}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <span className="font-serif-lux text-2xl" style={{ color: gradeColor(d.grade) }}>{d.grade}</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden mb-3">
              <motion.div className="h-full" style={{ background: gradeColor(d.grade) }} initial={{ width: 0 }} animate={{ width: `${d.score}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{d.why}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Improvement plan */}
        <div className="surface rounded-3xl p-8">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Como valer mais</h2></div>
          <p className="text-muted-foreground text-sm mb-6">Caminho para {sym}{Number(data.next_target).toLocaleString("pt-PT")}</p>
          <div className="space-y-4">
            {data.improvement_plan.map((p, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className="flex gap-3" data-testid={`plan-item-${i}`}>
                <div className="w-7 h-7 rounded-lg bg-[#3B82F6]/15 text-[#3B82F6] flex items-center justify-center text-sm font-medium shrink-0">{i + 1}</div>
                <div>
                  <div className="text-sm font-medium">{p.action}</div>
                  <div className="text-xs text-[#10B981] mt-0.5 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{p.impact}</div>
                </div>
              </motion.div>
            ))}
            {data.improvement_plan.length === 0 && <p className="text-sm text-muted-foreground">Adiciona mais dados financeiros para um plano detalhado.</p>}
          </div>
        </div>

        {/* Confidence checklist */}
        <div className="surface rounded-3xl p-8">
          <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Subir para avaliação profissional</h2></div>
          <p className="text-muted-foreground text-sm mb-6">Carrega estes documentos para uma avaliação de nível profissional.</p>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg" onChange={onFile} className="hidden" data-testid="doc-file-input" />
          <div className="space-y-3">
            {data.confidence.checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-3" data-testid={`checklist-${i}`}>
                {c.done ? <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />}
                <span className={`text-sm flex-1 ${c.done ? "" : "text-muted-foreground"}`}>{c.item}</span>
                {c.upload_type && !c.done && (
                  <button onClick={() => pickFile(c.upload_type)} disabled={uploadingType === c.upload_type}
                    data-testid={`upload-${c.upload_type}`}
                    className="flex items-center gap-1.5 text-xs text-[#3B82F6] hover:gap-2 transition-all disabled:opacity-50">
                    {uploadingType === c.upload_type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carregar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.document_insights?.length > 0 && (
        <div className="surface rounded-3xl p-8 mt-6" data-testid="doc-insights">
          <div className="flex items-center gap-2 mb-1"><FileSearch className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Documentos analisados pela IA</h2></div>
          <p className="text-muted-foreground text-sm mb-6">O que o CEO AI 2.0 leu nos teus documentos e usou nesta avaliação.</p>
          <div className="space-y-3">
            {data.document_insights.map((di, i) => (
              <div key={i} className="flex gap-3 items-start p-4 rounded-2xl border border-border" data-testid={`doc-insight-${i}`}>
                {di.relevant ? <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" /> : <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{di.filename}
                    <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${di.quality === "high" ? "#10B981" : di.quality === "medium" ? "#F59E0B" : "#A1A1AA"}22`, color: di.quality === "high" ? "#10B981" : di.quality === "medium" ? "#F59E0B" : "#A1A1AA" }}>{di.quality === "high" ? "Alta" : di.quality === "medium" ? "Média" : "Baixa"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{di.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
