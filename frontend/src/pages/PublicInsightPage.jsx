import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPublicArticle, trackPublicSurface, trackPublicView } from "@/lib/publicSite";
import { PublicContentRenderer } from "@/components/public/PublicContentRenderer";
import { applyPublicSeo } from "@/lib/seo";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function PublicInsightPage() {
  const { slug } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPublicArticle(slug)
      .then((data) => {
        if (!active) return;
        setEntry(data);
        applyPublicSeo({ title: `${data.seo_title || data.title} | CEO AI 2.0`, description: data.seo_description || data.excerpt, canonicalPath: data.public_url || `/insights/${slug}` });
        trackPublicView("article", slug).catch(() => {});
        trackPublicSurface(`article-${slug}`, data.public_url || `/insights/${slug}`, data.title).catch(() => {});
      })
      .catch(() => {
        if (!active) return;
        setEntry(null);
        applyPublicSeo({ title: "Insight não encontrado | CEO AI 2.0", description: "Conteúdo público não encontrado.", canonicalPath: `/insights/${slug}` });
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen bg-[#05050A] text-white flex items-center justify-center" data-testid="public-insight-loading"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-[#05050A] text-white flex items-center justify-center px-6" data-testid="public-insight-not-found">
        <div className="max-w-xl text-center">
          <h1 className="font-serif-lux text-4xl mb-3">Conteúdo não encontrado</h1>
          <p className="text-slate-400 mb-6">Este URL já não está publicado ou foi revertido.</p>
          <Link to="/insights" className="inline-flex items-center gap-2 rounded-full bg-[#3B82F6] px-5 py-3 text-sm font-medium text-white" data-testid="public-insight-back-button">
            <ArrowLeft className="w-4 h-4" /> Ver todos os insights
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05050A] text-white grain" data-testid="public-insight-page">
      <div className="max-w-[920px] mx-auto px-6 py-14 md:py-20">
        <Link to="/insights" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-[#3B82F6] transition-colors mb-8" data-testid="public-insight-back-link">
          <ArrowLeft className="w-4 h-4" /> Voltar aos insights
        </Link>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#3B82F6] mb-3" data-testid="public-insight-seo-keyword">{entry.seo_keyword}</p>
        <h1 className="font-serif-lux text-4xl sm:text-5xl leading-[1.05] mb-4" data-testid="public-insight-heading">{entry.title}</h1>
        <p className="text-sm md:text-lg text-slate-300 leading-8 mb-8" data-testid="public-insight-excerpt">{entry.excerpt}</p>
        {entry.hero_image_url && <img src={entry.hero_image_url} alt={entry.title} className="w-full aspect-[16/9] object-cover rounded-[28px] mb-10" data-testid="public-insight-hero-image" />}
        <PublicContentRenderer entry={entry} testIdPrefix="public-insight" />
        {entry.cta_label && (
          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex items-center justify-between gap-4 flex-wrap" data-testid="public-insight-cta-card">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Próximo passo</p>
              <p className="text-sm text-slate-300 mt-2">Este conteúdo foi publicado automaticamente pelo gateway interno do CEO AI 2.0.</p>
            </div>
            <Link to={entry.cta_url || "/contacto"} className="rounded-full bg-[#3B82F6] px-5 py-3 text-sm font-medium text-white" data-testid="public-insight-cta-link">
              {entry.cta_label}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}