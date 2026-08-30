import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAppData } from "@/context/AppDataContext";
import { fetchPublicSections } from "@/lib/publicSite";
import { applyPublicSeo } from "@/lib/seo";
import { trackPublicSurface } from "@/lib/publicSite";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Check, Loader2, Crown, Flame, Shield, Sparkles, Users, ChevronDown, MessageSquare } from "lucide-react";

const FOUNDER_FEATURES = [
  "Acesso completo ao CEO AI 2.0",
  "Todas as funcionalidades do Plano Professional",
  "Todas as futuras funcionalidades Professional incluídas",
  'Distintivo exclusivo "Empresa Fundadora"',
  "Suporte prioritário",
  "Acesso antecipado às novas funcionalidades",
  "Influência direta na evolução do produto",
  "Comunidade exclusiva de Empresas Fundadoras",
];
const PRO_FEATURES = [
  "Painel do CEO", "Saúde Empresarial", "Valor da Empresa", "Motor do Futuro",
  "Relatórios Executivos", "Conversar com o CEO AI 2.0", "Análises ilimitadas", "Melhorias contínuas",
];
const ENT_FEATURES = [
  "Tudo do Professional", "Multiempresa", "Gestão de Equipas",
  "Suporte Prioritário", "Integrações Personalizadas", "Gestor de Conta Dedicado",
];
const TRUST = [
  "Cancelamento quando desejar", "Pagamentos seguros", "Atualizações contínuas",
  "Plataforma em conformidade com o RGPD", "Inteligência Artificial em evolução permanente",
];
const FAQ = [
  { q: "Porque existem apenas 15 Empresas Fundadoras?", a: "Porque queremos trabalhar de forma próxima com um grupo reduzido de empresas para construir o melhor Diretor Executivo Digital do mercado." },
  { q: "O meu preço pode aumentar?", a: "Não. Enquanto mantiver a subscrição ativa, o seu preço permanecerá exatamente o mesmo." },
  { q: "Posso cancelar?", a: "Sim. Pode cancelar quando desejar. No entanto, se cancelar, perderá definitivamente o preço de Empresa Fundadora." },
];

export default function Pricing() {
  const { isPremium } = useAppData();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(null);
  const [openFaq, setOpenFaq] = useState(0);
  const [heroCopy, setHeroCopy] = useState({
    headline: "Planos e Preços",
    subtitle: "Escolha o plano ideal para transformar a forma como gere a sua empresa. Todos os planos incluem melhorias contínuas da Inteligência Artificial e atualizações gratuitas.",
  });

  const loadStatus = () => api.get("/founders/status").then(({ data }) => setStatus(data)).catch(() => {});
  useEffect(() => { loadStatus(); }, []);
  useEffect(() => {
    fetchPublicSections(["pricing.hero_headline", "pricing.hero_subtitle"])
      .then((sections) => {
        setHeroCopy((current) => ({
          headline: sections["pricing.hero_headline"]?.value || current.headline,
          subtitle: sections["pricing.hero_subtitle"]?.value || current.subtitle,
        }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    applyPublicSeo({ title: "CEO AI 2.0 | Planos", description: heroCopy.subtitle, canonicalPath: "/planos" });
    trackPublicSurface("pricing", "/planos", "Planos").catch(() => {});
  }, [heroCopy.subtitle]);

  const checkout = async (lookup_key) => {
    setLoading(lookup_key);
    try {
      const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === "founder_closed") {
        toast.error("A última vaga de Empresa Fundadora acabou de ser ativada. O Plano Professional continua disponível por 59 €/mês.");
        loadStatus();
      } else if (detail === "founder_used") {
        toast.error("Já utilizaste o preço de Empresa Fundadora anteriormente.");
      } else {
        toast.error(formatApiError(detail) || "Não foi possível iniciar o pagamento");
      }
      setLoading(null);
    }
  };

  const claimed = status?.claimed ?? 0;
  const limit = status?.limit ?? 15;
  const remaining = status?.remaining ?? limit;
  const founderOpen = status?.program_active;
  const progress = Math.min(100, Math.round((claimed / limit) * 100));

  return (
    <div className="px-6 md:px-10 py-14 md:py-20 max-w-[1180px] mx-auto">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-14">
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-[#3B82F6] mb-5"><Sparkles className="w-4 h-4" /> Diretor Executivo Digital</span>
        <h1 className="font-serif-lux text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-5" data-testid="pricing-public-headline">{heroCopy.headline}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg leading-relaxed" data-testid="pricing-public-subtitle">
          {heroCopy.subtitle}
        </p>
      </motion.div>

      {isPremium && (
        <div className="surface rounded-2xl p-4 mb-10 text-center border border-[#10B981]/30" data-testid="already-premium-banner">
          <p className="text-sm text-[#10B981] flex items-center justify-center gap-2"><Crown className="w-4 h-4" /> Já tens um plano ativo. Gere-o na área Subscrição.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-stretch">
        {founderOpen ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            data-testid="plan-founder"
            className="relative rounded-3xl p-8 border-2 border-[#3B82F6] bg-gradient-to-b from-[#3B82F6]/[0.10] to-transparent lg:-mt-4 lg:mb-4 shadow-[0_0_50px_-12px_rgba(59,130,246,0.35)] hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[#3B82F6] text-white px-4 py-1.5 text-xs font-semibold shadow-lg">
              <Flame className="w-3.5 h-3.5" /> Oferta Exclusiva
            </div>
            <h3 className="font-serif-lux text-2xl mt-2">Empresa Fundadora</h3>
            <div className="flex items-end gap-2 mt-4 mb-1">
              <span className="font-serif-lux text-5xl text-[#3B82F6]">29 €</span>
              <span className="text-muted-foreground mb-2">/mês</span>
            </div>
            <p className="text-sm text-muted-foreground line-through mb-5">59 €/mês</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Ajude-nos a construir o futuro do CEO AI 2.0. Estamos a abrir a plataforma apenas para as primeiras 15 empresas — que terão o preço mais baixo que alguma vez existirá. Enquanto mantiverem a subscrição ativa, este preço nunca aumentará.
            </p>

            <div className="rounded-2xl bg-[#0B0C10]/40 border border-[#3B82F6]/20 p-4 mb-6" data-testid="founder-counter">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="w-4 h-4 text-[#3B82F6]" /> Empresas Fundadoras</span>
                <span className="font-medium" data-testid="founder-count">{claimed} de {limit}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(progress, 4)}%` }} transition={{ duration: 0.9, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" data-testid="founder-progress" />
              </div>
              <p className="text-xs text-[#3B82F6] mt-2" data-testid="founder-remaining">
                {remaining === 1 ? "Resta 1 vaga" : `Restam ${remaining} vagas`}
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {FOUNDER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-[#3B82F6] mt-0.5 shrink-0" />{f}</li>
              ))}
            </ul>
            <button data-testid="checkout-founder" onClick={() => checkout("founder_monthly")} disabled={loading === "founder_monthly"}
              className="w-full rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] hover:-translate-y-0.5 font-semibold py-4 transition-all inline-flex items-center justify-center gap-2">
              {loading === "founder_monthly" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Crown className="w-4 h-4" /> Quero ser uma Empresa Fundadora</>}
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            data-testid="plan-founder-closed"
            className="rounded-3xl p-8 border border-border surface flex flex-col items-center justify-center text-center lg:-mt-4 lg:mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#3B82F6]/15 flex items-center justify-center mb-4"><Flame className="w-6 h-6 text-[#3B82F6]" /></div>
            <h3 className="font-serif-lux text-2xl mb-3">Programa Empresas Fundadoras encerrado</h3>
            <p className="text-sm text-muted-foreground">As inscrições estão agora disponíveis através do Plano Professional.</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          data-testid="plan-professional"
          className="rounded-3xl p-8 border border-[#4a83ff]/30 surface hover:-translate-y-1 transition-transform duration-300">
          <h3 className="font-serif-lux text-2xl">Professional</h3>
          <div className="flex items-end gap-2 mt-4 mb-5">
            <span className="font-serif-lux text-5xl text-[#7aa2ff]">59 €</span>
            <span className="text-muted-foreground mb-2">/mês</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Ideal para empresas que pretendem um Diretor Executivo Digital a acompanhar diariamente o seu negócio.
          </p>
          <ul className="space-y-3 mb-8">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-[#7aa2ff] mt-0.5 shrink-0" />{f}</li>
            ))}
          </ul>
          <button data-testid="checkout-professional" onClick={() => checkout("professional_monthly")} disabled={loading === "professional_monthly"}
            className="w-full rounded-full bg-[#4a83ff] text-white hover:bg-[#3d73ea] hover:-translate-y-0.5 font-semibold py-4 transition-all inline-flex items-center justify-center gap-2">
            {loading === "professional_monthly" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Começar Teste Gratuito"}
          </button>
          <p className="text-xs text-muted-foreground text-center mt-3">7 dias grátis · cancela quando quiser</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          data-testid="plan-enterprise"
          className="rounded-3xl p-8 border border-border surface hover:-translate-y-1 transition-transform duration-300">
          <h3 className="font-serif-lux text-2xl">Enterprise</h3>
          <div className="flex items-end gap-2 mt-4 mb-5">
            <span className="font-serif-lux text-4xl">Desde 159,99 €</span>
            <span className="text-muted-foreground mb-1">/mês</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Para empresas que necessitam de múltiplas empresas, equipas, personalizações e integrações.
          </p>
          <ul className="space-y-3 mb-8">
            {ENT_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />{f}</li>
            ))}
          </ul>
          <button data-testid="checkout-enterprise" onClick={() => navigate("/contacto")}
            className="w-full rounded-full border border-border hover:bg-accent font-semibold py-4 transition-colors inline-flex items-center justify-center gap-2">
            <MessageSquare className="w-4 h-4" /> Falar com um Consultor
          </button>
        </motion.div>
      </div>

      <section className="mt-20 rounded-3xl surface p-8 md:p-12 border border-[#3B82F6]/20" data-testid="why-founder">
        <div className="flex items-center gap-2 text-[#3B82F6] mb-4"><Flame className="w-5 h-5" /><span className="text-xs uppercase tracking-[0.2em]">Oportunidade rara</span></div>
        <h2 className="font-serif-lux text-3xl md:text-4xl mb-4">Porque criar uma Empresa Fundadora?</h2>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          Estamos a selecionar apenas 15 empresas para participar na primeira fase de crescimento do CEO AI 2.0. Estas empresas terão acesso direto à equipa de desenvolvimento, poderão influenciar a evolução da plataforma e manterão um preço exclusivo para sempre, desde que mantenham a subscrição ativa. Depois de preenchidas as 15 vagas, este plano desaparecerá definitivamente.
        </p>
      </section>

      <section className="mt-8 rounded-3xl surface p-8 md:p-10" data-testid="trust-section">
        <div className="flex items-center gap-2 text-muted-foreground mb-6"><Shield className="w-5 h-5 text-[#10B981]" /><span className="text-xs uppercase tracking-[0.2em]">Todos os planos incluem</span></div>
        <div className="grid sm:grid-cols-2 gap-4">
          {TRUST.map((t) => (
            <div key={t} className="flex items-center gap-3 text-sm"><Check className="w-4 h-4 text-[#10B981] shrink-0" />{t}</div>
          ))}
        </div>
      </section>

      <section className="mt-8" data-testid="faq-section">
        <h2 className="font-serif-lux text-3xl mb-6 text-center">Perguntas frequentes</h2>
        <div className="max-w-2xl mx-auto space-y-3">
          {FAQ.map((item, i) => (
            <div key={i} className="surface rounded-2xl overflow-hidden" data-testid={`faq-${i}`}>
              <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
                <span className="font-medium">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
