import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPublicPage, trackPublicSurface, trackPublicView } from "@/lib/publicSite";
import { PublicContentRenderer } from "@/components/public/PublicContentRenderer";
import { applyPublicSeo } from "@/lib/seo";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function PublicSitePage() {
  const { slug } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPublicPage(slug)
      .then((data) => {
        if (!active) return;
        setEntry(data);
        applyPublicSeo({ title: `${data.seo_title || data.title} | CEO AI 2.0`, description: data.seo_description || data.excerpt, canonicalPath: data.public_url || `/site/${slug}` });
        trackPublicView("page", slug).catch(() => {});
        trackPublicSurface(`page-${slug}`, data.public_url || `/site/${slug}`, data.title).catch(() => {});
      })
      .catch(() => {
        if (!active) return;
        setEntry(null);
        applyPublicSeo({ title: "Página não encontrada | CEO AI 2.0", description: "Página pública não encontrada.", canonicalPath: `/site/${slug}` });
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen bg-[#05050A] text-white flex items-center justify-center" data-testid="public-site-page-loading"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-[#05050A] text-white flex items-center justify-center px-6" data-testid="public-site-page-not-found">
        <div className="max-w-xl text-center">
          <h1 className="font-serif-lux text-4xl mb-3">Página não encontrada</h1>
          <p className="text-slate-400 mb-6">Esta página pública já não está disponível.</p>
          <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-[#3B82F6] px-5 py-3 text-sm font-medium text-white" data-testid="public-site-page-back-button">
            <ArrowLeft className="w-4 h-4" /> Voltar ao CEO AI 2.0
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05050A] text-white grain" data-testid="public-site-page">
      <div className="max-w-[920px] mx-auto px-6 py-14 md:py-20">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-[#3B82F6] transition-colors mb-8" data-testid="public-site-page-back-link">
          <ArrowLeft className="w-4 h-4" /> Voltar ao CEO AI 2.0
        </Link>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#3B82F6] mb-3" data-testid="public-site-page-seo-keyword">{entry.seo_keyword}</p>
        <h1 className="font-serif-lux text-4xl sm:text-5xl leading-[1.05] mb-4" data-testid="public-site-page-heading">{entry.title}</h1>
        <p className="text-sm md:text-lg text-slate-300 leading-8 mb-8" data-testid="public-site-page-excerpt">{entry.excerpt}</p>
        {entry.hero_image_url && <img src={entry.hero_image_url} alt={entry.title} className="w-full aspect-[16/9] object-cover rounded-[28px] mb-10" data-testid="public-site-page-hero-image" />}
        <PublicContentRenderer entry={entry} testIdPrefix="public-site-page" />
      </div>
    </div>
  );
}