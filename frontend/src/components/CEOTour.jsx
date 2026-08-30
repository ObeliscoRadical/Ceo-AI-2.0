import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { CEOOrb } from "@/components/CEOOrb";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, Upload } from "lucide-react";

function sectorKey(sector = "") {
  const s = sector.toLowerCase();
  if (/(constru|obra|empreit|civil|remodel|edifica)/.test(s)) return "construcao";
  if (/(restaura|restaurante|café|cafe|\bbar\b|catering|padaria|pastelaria|cozinha|hotel|aloj)/.test(s)) return "restauracao";
  if (/(clínic|clinic|saúde|saude|médic|medic|dent|estét|estet|hospital|fisio|terap)/.test(s)) return "clinica";
  return "generico";
}

const PRIORIDADE = {
  construcao: "Aqui mostro-te o que mais pesa numa construtora hoje: margem por obra, prazos de recebimento e a tua tesouraria. É o primeiro sítio onde olho todas as manhãs.",
  restauracao: "Aqui destaco o que decide o mês de um restaurante: custo da matéria-prima (food cost), ocupação de mesas e desperdício. É o primeiro sítio onde olho todas as manhãs.",
  clinica: "Aqui mostro o que faz mover uma clínica: ocupação da agenda, faturação por especialidade e eficiência operacional. É o primeiro sítio onde olho todas as manhãs.",
  generico: "Aqui coloco a decisão nº1 do teu dia — aquilo que, se resolveres agora, tem mais impacto no resultado. É o primeiro sítio onde olho todas as manhãs.",
};

const SAUDE = {
  construcao: "Traduzo os teus números num só valor: obras rentáveis, caixa para adiantar materiais e mão-de-obra, e risco de rutura entre faturas.",
  restauracao: "Traduzo os teus números num só valor: margem depois do food cost e pessoal, sustentabilidade dos turnos e fôlego de caixa.",
  clinica: "Traduzo os teus números num só valor: rentabilidade por especialidade, ocupação da agenda e solidez financeira da clínica.",
  generico: "Traduzo toda a tua empresa num só valor de saúde, para saberes num segundo se estás bem ou se algo precisa de atenção.",
};

const CHAT = {
  construcao: "Fala comigo como falarias com um sócio que já geriu dezenas de construtoras. Pergunta-me se aceito uma obra, que margem pedir ou como cobrar mais depressa.",
  restauracao: "Fala comigo como falarias com um sócio que já geriu dezenas de restaurantes. Pergunta-me sobre preços da ementa, controlar o food cost ou lançar um turno novo.",
  clinica: "Fala comigo como falarias com um sócio que já geriu várias clínicas. Pergunta-me sobre preços por consulta, agenda ou contratar mais um profissional.",
  generico: "Fala comigo como falarias com um sócio experiente. Decidimos juntos, com base nos teus números reais — não em teoria.",
};

export function CEOTour() {
  const { user } = useAuth();
  const { companies, activeCompanyId } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const checkedRef = useRef(false);

  const active = companies.find((c) => c.id === activeCompanyId);
  const sk = sectorKey(active?.sector || "");
  const firstName = (user?.name || "").split(" ")[0] || "";

  const steps = [
    {
      key: "welcome", center: true, title: "👋 Bem-vindo ao CEO AI 2.0",
      body: `Olá, ${firstName}. Eu sou o teu Diretor Executivo Digital.\nA minha missão é ajudar-te a tomar melhores decisões para a tua empresa.\nEm menos de 2 minutos mostro-te como.`,
      cta: "Começar",
    },
    {
      key: "painel", selectors: ['[data-testid="ceo-greeting"]'], title: "O teu Painel do CEO",
      body: "Todas as manhãs analiso a tua empresa e digo-te, em linguagem simples, o que está a correr bem, o que exige atenção e o que eu faria hoje.",
      cta: "Continuar",
    },
    {
      key: "prioridade", selectors: ['[data-testid="signal-priority"]', '[data-testid="signals-section"]', '[data-testid="no-data-hint"]', '[data-testid="ceo-greeting"]'],
      title: "Prioridade Máxima", body: PRIORIDADE[sk], cta: "Continuar",
    },
    {
      key: "saude", selectors: ['[data-testid="nav-saude"]'], title: "Saúde Empresarial",
      body: SAUDE[sk], cta: "Continuar",
    },
    {
      key: "chat", selectors: ['[data-testid="nav-ceo"]'], title: "Reunião com CEO",
      body: CHAT[sk], cta: "Continuar",
    },
    {
      key: "relatorio", selectors: ['[data-testid="nav-relatorios"]'], title: "Relatório",
      body: "Sempre que precisares — para o banco, um investidor ou só para ti — gero um relatório executivo da tua empresa, pronto a apresentar.",
      cta: "Continuar",
    },
    {
      key: "final", center: true, title: "Agora é a tua vez",
      body: "Vamos analisar a TUA empresa. Liga os teus dados e eu calculo o valor real do negócio e afino cada decisão ao que se passa contigo.",
      cta: "Carregar os meus dados", ctaIcon: true,
    },
  ];

  const cur = steps[step];

  const findTarget = useCallback(() => {
    if (!cur || cur.center || !cur.selectors) return null;
    for (const sel of cur.selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) return el;
      }
    }
    return null;
  }, [cur]);

  const measure = useCallback(() => {
    const el = findTarget();
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right });
    });
  }, [findTarget]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); };
  }, [open, step, measure]);

  const start = useCallback(() => { setStep(0); setOpen(true); }, []);

  useEffect(() => {
    const h = () => { if (location.pathname !== "/") navigate("/"); start(); };
    window.addEventListener("start-ceo-tour", h);
    return () => window.removeEventListener("start-ceo-tour", h);
  }, [start, location.pathname, navigate]);

  useEffect(() => {
    if (checkedRef.current || !user || location.pathname !== "/") return;
    checkedRef.current = true;
    api.get("/settings").then(({ data }) => {
      if (!data?.tour_completed) setTimeout(start, 1000);
    }).catch(() => {});
  }, [user, location.pathname, start]);

  const finishTour = (goData) => {
    setOpen(false);
    api.put("/settings", { tour_completed: true }).catch(() => {});
    if (goData) navigate("/financas");
  };

  const next = () => {
    if (step >= steps.length - 1) return finishTour(true);
    setStep((s) => s + 1);
  };

  if (!open) return null;

  const cardStyle = {};
  if (!cur.center && rect) {
    const vw = window.innerWidth, vh = window.innerHeight, cardW = Math.min(360, vw - 32);
    if (rect.width < 280 && rect.left < vw * 0.4 && vw >= 768) {
      cardStyle.left = Math.min(rect.right + 20, vw - cardW - 16);
      cardStyle.top = Math.min(rect.top, vh - 260);
    } else if (rect.top < vh * 0.5) {
      cardStyle.left = Math.min(Math.max(rect.left, 16), vw - cardW - 16);
      cardStyle.top = rect.bottom + 16;
    } else {
      cardStyle.left = Math.min(Math.max(rect.left, 16), vw - cardW - 16);
      cardStyle.bottom = vh - rect.top + 16;
    }
    cardStyle.width = cardW;
  }

  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  const centered = cur.center || !rect || mobile;
  const showOrb = cur.center;

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="ceo-tour-overlay">
      {/* dimmer / spotlight */}
      {(cur.center || !rect) ? (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" />
      ) : (
        <>
          {mobile && <div className="absolute inset-0 bg-black/50" />}
          <motion.div
            initial={false}
            animate={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute rounded-2xl pointer-events-none"
            style={{ boxShadow: mobile ? "0 0 0 3px #3B82F6" : "0 0 0 9999px rgba(0,0,0,0.78), 0 0 0 2px #3B82F6", background: "transparent" }}
          />
        </>
      )}

      {/* progress + skip */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i <= step ? "w-8 bg-[#3B82F6]" : "w-4 bg-white/25"}`} />
        ))}
      </div>
      <button data-testid="tour-skip-btn" onClick={() => finishTour(false)}
        className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10">
        <X className="w-5 h-5" />
      </button>

      {/* card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={cur.key}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          data-testid={`tour-step-${cur.key}`}
          className={centered
            ? "fixed inset-x-4 bottom-6 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[420px]"
            : "absolute"}
          style={centered ? {} : cardStyle}
        >
          <div className="bg-[hsl(var(--card))] border border-[#3B82F6]/30 rounded-3xl p-6 md:p-7 shadow-2xl max-h-[82vh] overflow-y-auto">
            {showOrb && (
              <div className="flex justify-center mb-5"><CEOOrb size={84} mood="gold" /></div>
            )}
            <h3 className={`font-serif-lux text-2xl mb-3 ${showOrb ? "text-center" : ""}`}>{cur.title}</h3>
            <p className={`text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line ${showOrb ? "text-center" : ""}`}>{cur.body}</p>
            <div className="flex items-center gap-3 mt-6">
              {step > 0 && step < steps.length - 1 && (
                <button data-testid="tour-skip-inline" onClick={() => finishTour(false)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors">Saltar</button>
              )}
              <button data-testid="tour-next-btn" onClick={next}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] font-medium px-6 py-3 transition-colors">
                {cur.ctaIcon && <Upload className="w-4 h-4" />}
                {cur.cta}
                {!cur.ctaIcon && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}
