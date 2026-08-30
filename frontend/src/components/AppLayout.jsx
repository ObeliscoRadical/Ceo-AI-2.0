import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { Home, Lightbulb, HeartPulse, Coins, MessageSquare, Wallet, TrendingUp, FileText, Settings as SettingsIcon, LogOut, Building2, Plus, Crown, Check, Menu, Compass, Lock, Shield, ChevronDown, Target, LineChart, Landmark, Briefcase, Megaphone, HandCoins, PlugZap } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CEOTour } from "@/components/CEOTour";
import { toast } from "sonner";

const MARKETING_SUBNAV = [
  { to: "/marketing#marketing-agent-site", hash: "#marketing-agent-site", label: "Agente · Site", testid: "nav-marketing-agent-site" },
  { to: "/marketing#marketing-agent-social", hash: "#marketing-agent-social", label: "Agente · Redes Sociais", testid: "nav-marketing-agent-social" },
];

const MARKETING_HASH_GROUPS = {
  "#marketing-agent-site": "site",
  "#marketing-growth-site-strategy": "site",
  "#marketing-growth-site-publishing": "site",
  "#marketing-growth-seo-monitor": "site",
  "#marketing-agent-social": "social",
  "#marketing-social-get-started": "social",
  "#marketing-social-agent": "social",
  "#marketing-social-connection": "social",
  "#marketing-social-brand-identity": "social",
  "#marketing-social-campaigns": "social",
  "#marketing-social-execution": "social",
  "#marketing-social-analytics": "social",
  "#marketing-social-briefing": "social",
  "#marketing-social-approval": "social",
  "#marketing-social-calendar": "social",
};

const NAV = [
  { to: "/", label: "Painel do CEO", short: "Painel", icon: Home, end: true, testid: "nav-painel" },
  { to: "/conselho-executivo", label: "Conselho Executivo", short: "Conselho", icon: Landmark, testid: "nav-conselho-exec", gated: true },
  { to: "/crm", label: "CRM Comercial", short: "CRM", icon: Briefcase, testid: "nav-crm", gated: true },
  { to: "/captacao", label: "Captação", short: "Captação", icon: Target, testid: "nav-captacao", gated: true },
  { to: "/marketing", label: "Marketing", short: "Marketing", icon: Megaphone, testid: "nav-marketing", gated: true, children: MARKETING_SUBNAV },
  { to: "/apoios", label: "Apoios & Incentivos", short: "Apoios", icon: HandCoins, testid: "nav-apoios", gated: true },
  { to: "/conselhos", label: "Conselhos", short: "Conselhos", icon: Lightbulb, testid: "nav-conselhos", gated: true },
  { to: "/saude", label: "Saúde Empresarial", short: "Saúde", icon: HeartPulse, testid: "nav-saude", gated: true },
  { to: "/valor", label: "Valor da Empresa", short: "Valor", icon: Coins, testid: "nav-valor", gated: true },
  { to: "/meta", label: "Metas e Projeções", short: "Metas", icon: LineChart, testid: "nav-meta", gated: true },
  { to: "/futuro", label: "Futuro", short: "Futuro", icon: TrendingUp, testid: "nav-futuro", premium: true, gated: true },
  { to: "/ceo", label: "Reunião com CEO", short: "CEO", icon: MessageSquare, testid: "nav-ceo", gated: true },
  { to: "/financas", label: "Finanças", short: "Finanças", icon: Wallet, testid: "nav-financas" },
  { to: "/relatorios", label: "Relatórios", short: "Relatórios", icon: FileText, testid: "nav-relatorios", gated: true },
  { to: "/definicoes", label: "Empresa", short: "Definições", icon: SettingsIcon, testid: "nav-empresa" },
];

const INTEGRATION_NAV = [
  { to: "/integracoes", label: "ERP / Sistema de Gestão", short: "ERP", icon: PlugZap, testid: "nav-integracoes-erp" },
];

const Logo = ({ size = 40 }) => (
  <div className="relative flex items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
    <div className="absolute inset-1 rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)", filter: "blur(6px)" }} />
    <img src="/android_cut.png" alt="CEO AI 2.0" className="relative w-full h-full object-contain" style={{ filter: "drop-shadow(0 0 6px rgba(59,130,246,0.45))" }} />
  </div>
);

const SidebarItem = ({ n, isPremium, isAdmin, isActive, go }) => {
  const locked = n.gated && !isPremium && !isAdmin;
  const activeItem = isActive(n);
  const showCrown = n.premium && !isPremium && !isAdmin && !locked;
  return (
    <button
      data-testid={n.testid}
      onClick={() => go(locked ? "/planos" : n.to)}
      className={`group relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${
        activeItem
          ? "text-white bg-blue-500/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-slate-400 hover:text-white hover:bg-white/[0.045]"
      }`}
    >
      {activeItem && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.7)]" />}
      <n.icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${activeItem ? "text-blue-400" : "text-slate-500 group-hover:text-blue-400"}`} />
      <span className="truncate flex-1 text-left">{n.label}</span>
      {locked && <Lock className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />}
      {showCrown && <Crown className="w-3.5 h-3.5 text-amber-400/80" />}
    </button>
  );
};

const SidebarGroup = ({ n, mobile = false, isPremium, isAdmin, isActive, isOpen, setIsOpen, go, isMarketingChildActive }) => {
  const locked = n.gated && !isPremium && !isAdmin;
  const activeItem = isActive(n);
  const sharedClass = mobile
    ? `flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm transition-colors ${activeItem ? "bg-blue-500/10 text-blue-400" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"}`
    : `group relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${activeItem ? "text-white bg-blue-500/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : "text-slate-400 hover:text-white hover:bg-white/[0.045]"}`;

  return (
    <div data-testid={`${n.testid}-group`}>
      <button
        type="button"
        data-testid={mobile ? `${n.testid}-m` : n.testid}
        aria-expanded={isOpen}
        onClick={() => {
          if (locked) {
            go("/planos");
            return;
          }
          setIsOpen((current) => !current);
        }}
        className={sharedClass}
      >
        {!mobile && activeItem && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.7)]" />}
        <n.icon className={`${mobile ? "w-[18px] h-[18px]" : "w-[18px] h-[18px] shrink-0 transition-colors"} ${activeItem ? "text-blue-400" : "text-slate-500 group-hover:text-blue-400"}`} />
        <span className="truncate flex-1 text-left">{n.label}</span>
        {locked ? <Lock className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" /> : <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-blue-400" : "text-slate-500"}`} />}
      </button>

      {isOpen && !locked && (
        <div className={mobile ? "ml-4 mt-1 space-y-1 border-l border-white/10 pl-3" : "ml-6 mr-2 mt-1 space-y-1 border-l border-white/[0.08] pl-3"}>
          {n.children.map((child) => {
            const childActive = isMarketingChildActive(child.hash);
            return (
              <button
                key={child.to}
                type="button"
                data-testid={mobile ? `${child.testid}-m` : child.testid}
                onClick={() => go(child.to)}
                className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${childActive ? "bg-blue-500/10 text-blue-300" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${childActive ? "bg-blue-400" : "bg-slate-600 group-hover:bg-blue-400"}`} />
                <span className="flex-1 text-[12.5px] leading-snug">{child.label}</span>
                {child.badge && <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-300">{child.badge}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MobileDrawerNav = ({ active, setNewOpen, isPremium, isAdmin, isActive, go, doLogout, marketingOpen, setMarketingOpen, isMarketingChildActive }) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center gap-3 mb-8">
      <Logo />
      <div><span className="font-serif-lux text-xl">CEO AI 2.0</span><p className="text-[10px] text-slate-400 uppercase tracking-[0.15em]">Diretor Executivo Digital</p></div>
    </div>
    <button data-testid="company-selector-mobile" onClick={() => { setNewOpen(true); }} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] transition-colors mb-4 text-left">
      <Building2 className="w-4 h-4 text-blue-400" /><span className="text-sm truncate flex-1">{active?.name || "Empresa"}</span><Plus className="w-4 h-4 text-slate-400" />
    </button>
    <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
      {NAV.map((n) => {
        if (n.children) {
          return (
            <SidebarGroup
              key={n.to}
              n={n}
              mobile
              isPremium={isPremium}
              isAdmin={isAdmin}
              isActive={isActive}
              isOpen={marketingOpen}
              setIsOpen={setMarketingOpen}
              go={go}
              isMarketingChildActive={isMarketingChildActive}
            />
          );
        }

        const locked = n.gated && !isPremium && !isAdmin;
        return (
          <button key={n.to} data-testid={`${n.testid}-m`} onClick={() => go(locked ? "/planos" : n.to)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${isActive(n) ? "bg-blue-500/10 text-blue-400" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"}`}>
            <n.icon className="w-[18px] h-[18px]" />{n.label}{locked && <Lock className="w-3.5 h-3.5 ml-auto text-blue-400" />}
          </button>
        );
      })}
      <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Integrações</div>
      {INTEGRATION_NAV.map((n) => (
        <button key={n.to} data-testid={`${n.testid}-m`} onClick={() => go(n.to)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${isActive(n) ? "bg-blue-500/10 text-blue-400" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"}`}>
          <n.icon className="w-[18px] h-[18px]" />{n.label}
        </button>
      ))}
      {isAdmin && <button data-testid="nav-admin-m" onClick={() => go("/admin")} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/[0.04]"><Shield className="w-[18px] h-[18px]" /> Administração</button>}
      {!isPremium && !isAdmin && <button data-testid="nav-planos-m" onClick={() => go("/planos")} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm mt-1 border border-blue-500/30 text-blue-400"><Crown className="w-[18px] h-[18px]" /> Passar a Premium</button>}
    </nav>
    <div className="pt-4 border-t border-white/10 flex gap-2">
      <button onClick={() => { go("/subscricao"); }} className="flex-1 py-2 rounded-lg border border-white/10 text-xs text-slate-400">{isPremium ? "Subscrição" : "Upgrade"}</button>
      <button onClick={doLogout} data-testid="logout-btn-m" className="py-2 px-3 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-red-400"><LogOut className="w-4 h-4" /></button>
    </div>
  </div>
);

export function AppLayout() {
  const { user, logout } = useAuth();
  const { companies, activeCompanyId, isPremium, isAdmin, switchCompany, createCompany } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const [newOpen, setNewOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(location.pathname.startsWith("/marketing"));
  const [form, setForm] = useState({ name: "", region: "PT", currency: "EUR", sector: "" });

  useEffect(() => {
    if (location.pathname.startsWith("/marketing")) setMarketingOpen(true);
  }, [location.pathname]);

  const doLogout = async () => { await logout(); navigate("/login"); };
  const active = companies.find((c) => c.id === activeCompanyId);

  const addCompany = async (e) => {
    e.preventDefault();
    await createCompany(form);
    setNewOpen(false);
    setForm({ name: "", region: "PT", currency: "EUR", sector: "" });
    toast.success("Empresa criada e ativada");
    navigate("/");
  };

  const go = (to) => { navigate(to); setMobileOpen(false); };
  const isActive = (n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to));
  const isMarketingChildActive = (hash) => {
    if (location.pathname !== "/marketing") return false;
    const currentGroup = MARKETING_HASH_GROUPS[location.hash] || (!location.hash ? "site" : null);
    const askedGroup = MARKETING_HASH_GROUPS[hash];
    return Boolean(currentGroup && askedGroup && currentGroup === askedGroup);
  };

  const initials = (user?.name || user?.email || "?").trim().slice(0, 2).toUpperCase();

  const DesktopRail = (
    <aside className="hidden md:flex w-64 h-screen fixed left-0 top-0 flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#0a0a13]/95 to-[#05050A]/95 backdrop-blur-2xl z-40">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <Logo size={38} />
        <div className="leading-tight">
          <div className="font-serif-lux text-lg">CEO AI 2.0</div>
          <div className="text-[9.5px] text-slate-500 uppercase tracking-[0.18em]">Diretor Executivo</div>
        </div>
      </div>

      {/* Company switcher */}
      <div className="px-3 mb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="company-selector"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors text-left">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-blue-400" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-[9.5px] text-slate-500 uppercase tracking-wider leading-none mb-1">Empresa ativa</div>
                <div className="text-[13px] font-medium truncate">{active?.name || "Selecionar"}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[236px]" align="start" side="bottom">
            {companies.map((c) => (
              <DropdownMenuItem key={c.id} data-testid={`company-option-${c.id}`} onClick={() => switchCompany(c.id).then(() => navigate("/"))} className="cursor-pointer">
                <Check className={`w-4 h-4 mr-2 ${c.id === activeCompanyId ? "opacity-100 text-blue-400" : "opacity-0"}`} />
                <span className="truncate">{c.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem data-testid="add-company-trigger" onClick={() => setNewOpen(true)} className="cursor-pointer text-blue-400">
              <Plus className="w-4 h-4 mr-2" /> Nova empresa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
        <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Menu</div>
        {NAV.map((n) => (n.children ? <SidebarGroup key={n.to} n={n} isPremium={isPremium} isAdmin={isAdmin} isActive={isActive} isOpen={marketingOpen} setIsOpen={setMarketingOpen} go={go} isMarketingChildActive={isMarketingChildActive} /> : <SidebarItem key={n.to} n={n} isPremium={isPremium} isAdmin={isAdmin} isActive={isActive} go={go} />))}
        <div className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Integrações</div>
        {INTEGRATION_NAV.map((n) => <SidebarItem key={n.to} n={n} isPremium={isPremium} isAdmin={isAdmin} isActive={isActive} go={go} />)}
        {isAdmin && <SidebarItem n={{ to: "/admin", label: "Administração", icon: Shield, testid: "nav-admin" }} isPremium={isPremium} isAdmin={isAdmin} isActive={isActive} go={go} />}
        <div className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Conta</div>
        <button data-testid="restart-tour-btn" onClick={() => window.dispatchEvent(new Event("start-ceo-tour"))} className="group w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.045] transition-all"><Compass className="w-[18px] h-[18px] text-slate-500 group-hover:text-blue-400" /> Tour guiado</button>
        <button data-testid="nav-subscricao" onClick={() => go("/subscricao")} className="group w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.045] transition-all"><Crown className={`w-[18px] h-[18px] ${isPremium ? "text-amber-400" : "text-slate-500 group-hover:text-blue-400"}`} /> {isPremium ? "A minha subscrição" : "Ver planos"}</button>
      </nav>

      {/* Premium CTA */}
      {!isPremium && !isAdmin && (
        <div className="px-3 pb-3 pt-1">
          <button onClick={() => go("/planos")} data-testid="sidebar-premium-cta"
            className="w-full rounded-xl p-3.5 text-left relative overflow-hidden border border-blue-500/30 bg-gradient-to-br from-blue-600/25 to-blue-900/10 hover:from-blue-600/35 transition-colors">
            <div className="flex items-center gap-2 mb-1"><Crown className="w-4 h-4 text-amber-400" /><span className="text-[13px] font-semibold">Passar a Premium</span></div>
            <p className="text-[11px] text-slate-400 leading-snug">Desbloqueia decisões, saúde e relatórios do teu CEO.</p>
          </button>
        </div>
      )}

      {/* User */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-[0_0_12px_rgba(59,130,246,0.4)] overflow-hidden">
            {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{user?.name || "Utilizador"}</div>
            <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
          </div>
          <NotificationBell />
          <button data-testid="logout-btn" title="Sair" onClick={doLogout} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"><LogOut className="w-[17px] h-[17px]" /></button>
        </div>
      </div>
    </aside>
  );
  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {DesktopRail}

      <header className="md:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4 border-b border-white/[0.08] bg-[#05050A]/90 backdrop-blur-xl">
        <div className="flex items-center gap-2"><Logo /><span className="font-serif-lux text-lg">CEO AI 2.0</span></div>
        <div className="flex items-center gap-1">
          <NotificationBell compact />
          <button onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/10"><Menu className="w-5 h-5" /></button>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[288px] p-6 bg-[#07070d] border-white/10 overflow-y-auto">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <SheetDescription className="sr-only">Navegação mobile com acesso às áreas do CEO AI 2.0 e submenu de Marketing.</SheetDescription>
          <MobileDrawerNav active={active} setNewOpen={setNewOpen} isPremium={isPremium} isAdmin={isAdmin} isActive={isActive} go={go} doLogout={doLogout} marketingOpen={marketingOpen} setMarketingOpen={setMarketingOpen} isMarketingChildActive={isMarketingChildActive} />
        </SheetContent>
      </Sheet>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="surface">
          <DialogHeader><DialogTitle className="font-serif-lux text-2xl">Nova empresa</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">Adiciona outra empresa à tua conta. Podes trocar entre elas a qualquer momento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={addCompany} className="space-y-4">
            <div><Label className="text-xs text-muted-foreground">Nome</Label><Input data-testid="new-company-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1 bg-transparent" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs text-muted-foreground">Região</Label>
                <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v, currency: v === "BR" ? "BRL" : "EUR" })}>
                  <SelectTrigger data-testid="new-company-region" className="mt-1 bg-transparent"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PT">Portugal (€)</SelectItem><SelectItem value="BR">Brasil (R$)</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Setor</Label><Input data-testid="new-company-sector" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} className="mt-1 bg-transparent" /></div>
            </div>
            <Button data-testid="create-company-btn" type="submit" className="w-full rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">Criar empresa</Button>
          </form>
        </DialogContent>
      </Dialog>

      <main className="md:pl-64 min-h-screen pt-14 md:pt-0 relative z-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Outlet />
        </motion.div>
      </main>
      <CEOTour />
    </div>
  );
}
