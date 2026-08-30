import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2, Printer, AlertTriangle, Sparkles, Shield, TriangleAlert } from "lucide-react";
import { Watermark } from "@/components/Watermark";

export default function Relatorios() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/report").then(({ data }) => setData(data)); }, []);
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" />
      <p className="text-sm text-muted-foreground">O CEO AI 2.0 está a preparar o teu relatório estratégico...</p>
    </div>
  );
  const sym = data.currency_symbol || "€";
  const date = new Date(data.generated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="px-6 md:px-16 py-14 md:py-20 max-w-[900px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Relatórios Executivos</p>
        <Button data-testid="print-btn" onClick={() => window.print()} variant="outline" size="sm" className="rounded-full"><Printer className="w-4 h-4 mr-2" />Exportar</Button>
      </div>
      <div className="relative mb-2 pt-2">
        <Watermark text={data.company_name} />
        <h1 className="font-serif-lux text-4xl md:text-6xl relative z-10 leading-[1.05]">{data.company_name}</h1>
      </div>
      <p className="text-muted-foreground mb-12">{date} · Preparado pelo CEO AI · Saúde {data.health}/100 · Valor {sym}{Number(data.company_value).toLocaleString("pt-PT")}</p>

      <Section title="Situação atual"><p className="leading-relaxed text-[15px]">{data.situacao_atual}</p></Section>

      <div className="grid md:grid-cols-2 gap-5 mb-4">
        <ListCard title="Pontos fortes" items={data.pontos_fortes} Icon={Shield} tone="#10B981" />
        <ListCard title="Pontos fracos" items={data.pontos_fracos} Icon={TriangleAlert} tone="#F59E0B" />
        <ListCard title="Riscos" items={data.riscos} Icon={AlertTriangle} tone="#EF4444" />
        <ListCard title="Oportunidades" items={data.oportunidades} Icon={Sparkles} tone="#3B82F6" />
      </div>

      <Section title="Valor da empresa">
        <div className="font-serif-lux text-3xl text-[#3B82F6] mb-2">{data.valor?.atual}</div>
        <p className="leading-relaxed text-[15px]">{data.valor?.comentario}</p>
      </Section>

      <Section title="Projeção para 12 meses"><p className="leading-relaxed text-[15px]">{data.projecao_12m}</p></Section>

      <Section title="Plano de ação">
        <div className="space-y-3">
          {(data.plano_acao || []).map((p, i) => (
            <div key={i} className="flex gap-4 surface rounded-2xl p-5" data-testid={`plan-${i}`}>
              <div className="w-7 h-7 rounded-lg bg-[#3B82F6]/15 text-[#3B82F6] flex items-center justify-center text-sm font-medium shrink-0">{i + 1}</div>
              <div className="flex-1">
                <div className="font-medium">{p.acao}</div>
                <div className="text-sm text-muted-foreground mt-1">Prazo: {p.prazo} · Impacto: {p.impacto}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recomendações do CEO AI">
        <div className="surface rounded-3xl p-7 space-y-3">
          {(data.recomendacoes || []).map((r, i) => (
            <div key={i} className="flex gap-3 text-[15px]"><span className="text-[#3B82F6]">—</span><span className="leading-relaxed">{r}</span></div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-12">
      <h2 className="font-serif-lux text-2xl mb-4 pb-2 border-b border-border">{title}</h2>
      {children}
    </motion.section>
  );
}

function ListCard({ title, items, Icon, tone }) {
  return (
    <div className="surface rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4" style={{ color: tone }}><Icon className="w-4 h-4" /><span className="text-sm font-medium text-foreground">{title}</span></div>
      <ul className="space-y-2">
        {(items || []).map((it, i) => <li key={i} className="text-sm text-muted-foreground leading-relaxed flex gap-2"><span style={{ color: tone }}>·</span>{it}</li>)}
      </ul>
    </div>
  );
}
