import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublicEntries, trackPublicSurface } from "@/lib/publicSite";
import { applyPublicSeo } from "@/lib/seo";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";

export default function PublicInsightsHub() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyPublicSeo({ title: "Insights | CEO AI 2.0", description: "Hub público de conteúdos publicados autonomamente pelo agente de Growth.", canonicalPath: "/insights" });
    trackPublicSurface("insights-hub", "/insights", "Insights").catch(() => {});
    fetchPublicEntries("article")
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#05050A] text-white grain">
      <div className="max-w-[1100px] mx-auto px-6 py-14 md:py-20">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-[#3B82F6] transition-colors mb-8" data-testid="public-insights-back-link">
          <ArrowLeft className="w-4 h-4" /> Voltar ao CEO AI 2.0
        </Link>

        <div className="max-w-3xl mb-12">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">Site público dinâmico</p>
          <h1 className="font-serif-lux text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-4" data-testid="public-insights-title">
            Insights publicados pelo agente de Crescimento Orgânico
          </h1>
          <p className="text-sm md:text-lg text-slate-300 leading-8" data-testid="public-insights-description">
            Conteúdos públicos criados e atualizados diretamente pela infraestrutura atual do CEO AI 2.0, sem CMS externo.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24" data-testid="public-insights-loading">
            <Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center" data-testid="public-insights-empty">
            <BookOpen className="w-8 h-8 text-[#3B82F6] mx-auto mb-4" />
            <p className="font-medium">Ainda não existem insights públicos publicados.</p>
            <p className="text-sm text-slate-400 mt-2">Quando o gateway publicar artigos, eles aparecerão aqui automaticamente.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6" data-testid="public-insights-grid">
            {entries.map((entry, index) => (
              <Link key={entry.id} to={entry.public_url} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:-translate-y-1 transition-transform" data-testid={`public-insight-card-${index}`}>
                {entry.hero_image_url && (
                  <img src={entry.hero_image_url} alt={entry.title} className="w-full aspect-[16/10] object-cover rounded-2xl mb-5" data-testid={`public-insight-image-${index}`} />
                )}
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#3B82F6] mb-3" data-testid={`public-insight-keyword-${index}`}>{entry.seo_keyword}</p>
                <h2 className="font-serif-lux text-2xl mb-3" data-testid={`public-insight-title-${index}`}>{entry.title}</h2>
                <p className="text-sm text-slate-300 leading-7" data-testid={`public-insight-excerpt-${index}`}>{entry.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}