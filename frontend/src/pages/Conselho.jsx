import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, Landmark, Wallet, Briefcase, Megaphone, Sparkles, CheckCircle2,
  RefreshCw, ChevronDown, Target, ShieldAlert, Instagram, Facebook, MapPin, Play, HandCoins,
} from "lucide-react";

const DIRECTORS = [
  { key: "financeiro", label: "Diretor Financeiro", icon: Wallet, color: "#10B981" },
  { key: "comercial", label: "Diretor Comercial", icon: Briefcase, color: "#3B82F6" },
  { key: "marketing", label: "Diretor de Marketing", icon: Megaphone, color: "#A78BFA" },
  { key: "apoios", label: "Diretor de Apoios", icon: HandCoins, color: "#F59E0B" },
];
const RESP_COLOR = { Financeiro: "#10B981", Comercial: "#3B82F6", Marketing: "#A78BFA", Apoios: "#F59E0B" };
const INTEG_ICON = { instagram: Instagram, facebook: Facebook, google_business: MapPin };

function DirectorCard({ d, data, sym }) {
  const [open, setOpen] = useState(false);
  const Icon = d.icon;
  return (
    <div className="surface rounded-3xl p-6 flex flex-col" data-testid={`director-${d.key}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${d.color}18` }}>
          <Icon className="w-5 h-5" style={{ color: d.color }} />
        </div>
        <h3 className="font-serif-lux text-xl">{d.label}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{data.situacao}</p>
      {Array.isArray(data.indicadores) && data.indicadores.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {data.indicadores.map((it, i) => (
            <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
              <div className="text-sm font-medium mt-0.5">{it.valor}</div>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(data.prioridades) && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Prioridades</div>
          <ul className="space-y-1.5">
            {data.prioridades.map((p, i) => (
              <li key={i} className="text-sm flex gap-2"><span style={{ color: d.color }}>•</span> <span>{p}</span></li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(data.acoes) && data.acoes.length > 0 && (
        <div className="space-y-2 mb-2">
          {data.acoes.map((a, i) => (
            <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="text-sm font-medium">{a.acao}</div>
              {a.impacto && <div className="text-xs mt-0.5" style={{ color: d.color }}>Impacto: {a.impacto}</div>}
            </div>
          ))}
        </div>
      )}
      {Array.isArray(data.execucao) && data.execucao.length > 0 && (
        <div className="mt-auto pt-3">
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1" data-testid={`exec-toggle-${d.key}`}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} /> O que executa ao aprovar ({data.execucao.length})
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {data.execucao.map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2"><span>→</span> <span>{e}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Conselho() {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [tasks, setTasks] = useState([]);

  const load = () => api.get("/council/meeting").then(({ data }) => {
    setState(data);
    if (data.meeting?.approved) api.get("/council/tasks").then(({ data }) => setTasks(data.tasks || [])).catch(() => {});
  }).catch(() => setFailed(true));

  useEffect(() => { load(); }, []);

  const generate = async (refresh = false) => {
    setGen(true);
    try {
      await api.post(refresh ? "/council/meeting/refresh" : "/council/meeting/generate");
      setTasks([]);
      await load();
      toast.success(refresh ? "Nova reunião gerada." : "O Conselho reuniu-se.");
    } catch { toast.error("Não foi possível reunir o Conselho agora."); }
    setGen(false);
  };

  const approve = async () => {
    setApproving(true);
    try {
      const { data } = await api.post("/council/meeting/approve");
      if (data.ok) { toast.success(`Estratégia aprovada · ${data.tasks} tarefas em execução.`); await load(); }
      else toast.error("Gere a reunião primeiro.");
    } catch { toast.error("Não foi possível aprovar agora."); }
    setApproving(false);
  };

  if (failed) return <div className="text-center py-40 text-muted-foreground" data-testid="council-error">Não foi possível carregar. Atualiza a página.</div>;
  if (!state) return <div className="flex justify-center py-40"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;

  const ctx = state.context || state.meeting?.context || {};
  const sym = ctx.currency_symbol || "€";
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString(sym === "R$" ? "pt-BR" : "pt-PT", { maximumFractionDigits: 0 })}`;
  const m = state.meeting;
  const brain = m?.brain || {};
  const today = new Date(m?.date || state.date || Date.now()).toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="px-6 md:px-16 py-14 md:py-20 max-w-[1200px] mx-auto" data-testid="council-page">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">CEO AI 2.0 · Conselho Executivo Digital</p>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 className="font-serif-lux text-4xl md:text-5xl text-[#3B82F6] flex items-center gap-3">
            <Landmark className="w-8 h-8" /> Reunião Executiva de Hoje
          </h1>
          <p className="text-muted-foreground mt-3 capitalize">{today} · {ctx.company_name}</p>
        </div>
        {state.generated && (
          <Button data-testid="refresh-meeting-btn" onClick={() => generate(true)} disabled={gen} variant="outline" className="rounded-full border-white/15 hover:bg-white/5">
            {gen ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />} Nova reunião
          </Button>
        )}
      </div>

      {!state.generated ? (
        <div className="surface rounded-3xl p-8 md:p-12 text-center" data-testid="council-intro">
          <div className="flex justify-center gap-3 mb-6">
            {DIRECTORS.map((d) => (
              <div key={d.key} className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}18` }}>
                <d.icon className="w-6 h-6" style={{ color: d.color }} />
              </div>
            ))}
          </div>
          <h2 className="font-serif-lux text-2xl mb-2">Os seus Diretores IA estão prontos</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            O Financeiro, o Comercial e o Marketing vão analisar os seus dados reais e o Cérebro Orquestrador cruza tudo numa estratégia única para hoje.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8 text-left">
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4"><div className="text-[10px] uppercase tracking-wider text-[#10B981] mb-1">Financeiro</div><div className="text-sm">Caixa {fmt(ctx.cash)} · {ctx.runway} meses</div></div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4"><div className="text-[10px] uppercase tracking-wider text-[#3B82F6] mb-1">Comercial</div><div className="text-sm">{ctx.clients || 0} clientes · {ctx.client_recurrence || "recorrência n/d"}</div></div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4"><div className="text-[10px] uppercase tracking-wider text-[#A78BFA] mb-1">Marketing</div><div className="text-sm">Setor: {ctx.sector}</div></div>
          </div>
          <Button data-testid="generate-meeting-btn" onClick={() => generate(false)} disabled={gen} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] px-8 h-12 text-base">
            {gen ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> A reunir o Conselho…</> : <><Play className="w-5 h-5 mr-2" /> Reunir o Conselho</>}
          </Button>
        </div>
      ) : (
        <>
          {/* Diretores */}
          <div className="grid lg:grid-cols-3 gap-5 mb-8" data-testid="directors-grid">
            {DIRECTORS.map((d) => (
              <DirectorCard key={d.key} d={d} data={m.directors?.[d.key] || {}} sym={sym} />
            ))}
          </div>

          {/* Cérebro — Estratégia recomendada */}
          <div className="surface rounded-3xl p-6 md:p-8 mb-8 relative overflow-hidden" data-testid="brain-strategy">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#3B82F6]/10 blur-3xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/18 flex items-center justify-center"><Sparkles className="w-5 h-5 text-[#3B82F6]" /></div>
              <div>
                <h2 className="font-serif-lux text-2xl">Estratégia Recomendada</h2>
                <p className="text-xs text-muted-foreground">Cérebro Orquestrador · cruza os três diretores</p>
              </div>
            </div>
            {brain.resumo && <p className="text-muted-foreground mb-5">{brain.resumo}</p>}
            {brain.foco_principal && (
              <div className="rounded-2xl bg-[#3B82F6]/[0.08] border border-[#3B82F6]/25 p-4 mb-6 flex items-start gap-3">
                <Target className="w-5 h-5 text-[#3B82F6] mt-0.5 shrink-0" />
                <div><div className="text-[10px] uppercase tracking-wider text-[#3B82F6] mb-0.5">Foco principal</div><div className="font-medium">{brain.foco_principal}</div></div>
              </div>
            )}
            {Array.isArray(brain.estrategia) && (
              <div className="space-y-3 mb-6">
                {brain.estrategia.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]" data-testid={`strategy-step-${i}`}>
                    <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{s.passo}</span>
                        {s.responsavel && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: RESP_COLOR[s.responsavel] || "#94a3b8", background: `${RESP_COLOR[s.responsavel] || "#94a3b8"}18` }}>{s.responsavel}</span>}
                      </div>
                      {s.porque && <div className="text-sm text-muted-foreground mt-1">{s.porque}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(brain.kpis) && brain.kpis.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {brain.kpis.map((k, i) => (
                  <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                    <div className="text-sm font-medium mt-0.5">{k.meta}</div>
                  </div>
                ))}
              </div>
            )}
            {brain.risco && (
              <div className="flex items-start gap-2 text-sm text-[#F59E0B]"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> <span>Maior risco: {brain.risco}</span></div>
            )}
          </div>

          {/* Aprovação / Execução */}
          {!m.approved ? (
            <div className="text-center mb-10">
              <Button data-testid="approve-strategy-btn" onClick={approve} disabled={approving} className="rounded-full bg-[#10B981] text-white hover:bg-[#059669] px-10 h-12 text-base">
                {approving ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> A aprovar…</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Aprovar estratégia</>}
              </Button>
              <p className="text-xs text-muted-foreground mt-3">Ao aprovar, cada diretor recebe a sua parte para executar. As publicações reais em redes ligam-se na próxima fase.</p>
            </div>
          ) : (
            <div className="surface rounded-3xl p-6 md:p-8 mb-10" data-testid="execution-panel">
              <div className="flex items-center gap-2 mb-5 text-[#10B981]"><CheckCircle2 className="w-5 h-5" /> <h2 className="font-serif-lux text-2xl text-foreground">Estratégia aprovada — em execução</h2></div>
              <div className="grid md:grid-cols-3 gap-5 mb-6">
                {DIRECTORS.map((d) => {
                  const dt = tasks.filter((t) => t.director === d.key);
                  return (
                    <div key={d.key} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4" data-testid={`exec-${d.key}`}>
                      <div className="flex items-center gap-2 mb-3"><d.icon className="w-4 h-4" style={{ color: d.color }} /> <span className="text-sm font-medium">{d.label}</span></div>
                      <ul className="space-y-2">
                        {dt.length === 0 && <li className="text-xs text-muted-foreground">Sem tarefas.</li>}
                        {dt.map((t, i) => (
                          <li key={i} className="text-xs flex items-start gap-2">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] shrink-0 mt-0.5">pendente</span>
                            <span>{t.task}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <div className="pt-5 border-t border-white/[0.06]">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Integrações para publicação (próxima fase)</div>
                <div className="flex flex-wrap gap-3">
                  {(state.integrations || []).map((ig) => {
                    const IIcon = INTEG_ICON[ig.key] || MapPin;
                    return (
                      <span key={ig.key} className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-white/10 text-muted-foreground" data-testid={`integration-${ig.key}`}>
                        <IIcon className="w-4 h-4" /> {ig.label} <span className="text-[10px] text-[#F59E0B]">brevemente</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
