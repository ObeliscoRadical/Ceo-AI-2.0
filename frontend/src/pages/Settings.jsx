import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportsUploader } from "@/components/ReportsUploader";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Brain, Mail, Send, Building2, Search, Upload, BellRing } from "lucide-react";

const MODES = ["conservador", "crescimento", "agressivo", "familiar", "startup", "investidor"];
const MODELS = [
  { key: "claude", label: "Claude Opus 4.7" },
  { key: "gpt", label: "GPT-5.5" },
  { key: "gemini", label: "Gemini 3.1 Pro" },
];
const TONES = ["direto", "caloroso", "analítico", "motivador"];

function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [memories, setMemories] = useState([]);
  const [newMem, setNewMem] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingVal, setSendingVal] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    api.get("/settings").then(({ data }) => setSettings(data));
    api.get("/company").then(({ data }) => setCompany(data || {}));
    api.get("/memories").then(({ data }) => setMemories(data));
  }, []);

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const upC = (patch) => setCompany((c) => ({ ...c, ...patch }));
  const upProf = (patch) => setCompany((c) => ({ ...c, profile: { ...(c?.profile || {}), ...patch } }));

  const [nif, setNif] = useState("");
  const [looking, setLooking] = useState(false);
  const [importing, setImporting] = useState(false);
  const certRef = useRef(null);

  const applyImported = (d) => {
    if (!d) return;
    if (d.name) upC({ name: d.name });
    if (d.activity || d.cae) upC({ sector: d.activity || company.sector });
    upProf({
      ...(d.location ? { location: d.location } : {}),
      ...(d.cae ? { cae: d.cae } : {}),
      ...(d.objeto_social ? { business_model: d.objeto_social } : {}),
    });
  };

  const lookupNif = async () => {
    if (!nif.trim()) return;
    setLooking(true);
    try { const { data } = await api.post("/company/lookup-nif", { nif: nif.trim() }); applyImported(data); toast.success(`Encontrei: ${data.name || "empresa"}. Revê e guarda.`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Não consegui buscar o NIF."); }
    finally { setLooking(false); }
  };

  const importCertidao = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setImporting(true);
    try { const fd = new FormData(); fd.append("file", f); const { data } = await api.post("/company/import-certidao", fd, { headers: { "Content-Type": "multipart/form-data" } }); applyImported(data);
      if (data && (data.name || data.activity || data.cae || data.location || data.objeto_social)) toast.success("Li a certidão. Revê os campos e guarda.");
      else toast.warning("Li o ficheiro mas não encontrei dados da empresa. Preenche manualmente."); }
    catch (er) { toast.error(er?.response?.data?.detail || "Não consegui ler a certidão."); }
    finally { setImporting(false); if (certRef.current) certRef.current.value = ""; }
  };

  const saveCompany = async () => {
    setSavingCompany(true);
    try {
      await api.post("/company", {
        name: company.name || "A minha empresa", region: company.region || "PT", currency: company.currency || "EUR",
        sector: company.sector || "", employees_count: Number(company.employees_count) || 0,
        clients_count: Number(company.clients_count) || 0, bank_balance: Number(company.bank_balance) || 0,
        monthly_tax_estimate: Number(company.monthly_tax_estimate) || 0, profile: company.profile || {},
      });
      toast.success("Informação guardada. O teu CEO já a vai usar nas análises.");
    } catch { toast.error("Erro ao guardar"); }
    finally { setSavingCompany(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", settings);
      if (settings.theme) setTheme(settings.theme);
      toast.success("Personalização guardada");
    } catch { toast.error("Erro ao guardar"); }
    finally { setSaving(false); }
  };

  const addMem = async () => {
    if (!newMem.trim()) return;
    const { data } = await api.post("/memories", { content: newMem, category: "geral" });
    setMemories((m) => [{ id: data.id, content: newMem, category: "geral" }, ...m]);
    setNewMem("");
    toast.success("O CEO AI 2.0 vai lembrar-se disto.");
  };
  const delMem = async (id) => { await api.delete(`/memories/${id}`); setMemories((m) => m.filter((x) => x.id !== id)); };

  const toggleEmail = async (val) => {
    update({ email_briefing: val });
    try { await api.put("/settings", { ...settings, email_briefing: val }); toast.success(val ? "Briefing por email ativado" : "Briefing por email desativado"); }
    catch { toast.error("Erro ao guardar"); }
  };

  const toggleValueAlert = async (val) => {
    update({ email_value_alert: val });
    try { await api.put("/settings", { ...settings, email_value_alert: val }); toast.success(val ? "Resumo mensal de valor ativado" : "Resumo mensal de valor desativado"); }
    catch { toast.error("Erro ao guardar"); }
  };

  const toggleGrantAlert = async (val) => {
    update({ email_grant_alerts: val });
    try { await api.put("/settings", { ...settings, email_grant_alerts: val }); toast.success(val ? "Avisos de prazos de apoios ativados" : "Avisos de prazos de apoios desativados"); }
    catch { toast.error("Erro ao guardar"); }
  };

  const sendNow = async () => {
    setSendingEmail(true);
    try { const { data } = await api.post("/briefing/email"); toast.success(`Briefing enviado para ${data.to}`); }
    catch { toast.error("Não foi possível enviar o email"); }
    finally { setSendingEmail(false); }
  };

  const sendValueNow = async () => {
    setSendingVal(true);
    try { const { data } = await api.post("/value-alert/email"); toast.success(`Resumo de valor enviado para ${data.to}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Não foi possível enviar o email"); }
    finally { setSendingVal(false); }
  };

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Este dispositivo/navegador não suporta notificações push."); return;
    }
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("Permissão de notificações negada."); return; }
      await navigator.serviceWorker.register("/sw.js");
      const ready = await navigator.serviceWorker.ready;
      const { data } = await api.get("/push/vapid-public-key");
      const existing = await ready.pushManager.getSubscription();
      const sub = existing || await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(data.publicKey),
      });
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      toast.success("Notificações ativadas neste dispositivo ✅");
    } catch (e) {
      toast.error("Não foi possível ativar as notificações.");
    } finally { setPushBusy(false); }
  };

  const testPush = async () => {
    try { await api.post("/push/test"); toast.success("Notificação de teste enviada 🔔"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Ativa primeiro as notificações."); }
  };

  if (!settings || !company) return <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;

  const prof = company.profile || {};

  return (
    <div className="p-6 md:p-10 max-w-[900px] mx-auto">
      <h1 className="font-serif-lux text-4xl mb-1">Empresa</h1>
      <p className="text-muted-foreground text-sm mb-8">Quanto mais o teu CEO souber, melhores serão as decisões. Preenche o que puderes — em linguagem simples.</p>

      <div className="surface rounded-3xl p-8 mb-6">
        <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">A tua empresa</h2></div>
        <p className="text-muted-foreground text-sm mb-6">Esta informação alimenta todas as análises do CEO AI 2.0 (saúde, valor, conselhos e relatórios).</p>

        <div className="rounded-2xl border border-[#3B82F6]/25 p-5 mb-8" data-testid="import-card">
          <p className="text-sm font-medium mb-1">Preencher automaticamente</p>
          <p className="text-xs text-muted-foreground mb-4">Escreve o NIF da empresa ou carrega a certidão permanente (PDF) — eu preencho o que conseguir. Revê sempre antes de guardar.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2 flex-1">
              <Input data-testid="nif-input" value={nif} onChange={(e) => setNif(e.target.value)} placeholder="NIF / NIPC (9 dígitos)" className="bg-transparent" />
              <Button data-testid="nif-lookup-btn" onClick={lookupNif} disabled={looking} variant="outline" className="rounded-full shrink-0">
                {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}<span className="ml-1">Buscar</span>
              </Button>
            </div>
            <input ref={certRef} type="file" accept=".pdf,.txt,.docx" hidden onChange={importCertidao} />
            <Button data-testid="cert-upload-btn" onClick={() => certRef.current?.click()} disabled={importing} variant="outline" className="rounded-full shrink-0">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}<span className="ml-1">Carregar certidão (PDF)</span>
            </Button>
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-[#3B82F6] mb-3">O básico</p>
        <div className="grid md:grid-cols-2 gap-5 mb-8">
          <div><Label className="text-xs text-muted-foreground">Nome da empresa</Label>
            <Input data-testid="co-name" value={company.name || ""} onChange={(e) => upC({ name: e.target.value })} className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">O que a empresa faz (área)</Label>
            <Input data-testid="co-sector" value={company.sector || ""} onChange={(e) => upC({ sector: e.target.value })} placeholder="Ex: restauração, construção, loja online" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">País</Label>
            <Select value={company.region || "PT"} onValueChange={(v) => upC({ region: v, currency: v === "BR" ? "BRL" : v === "PT" ? "EUR" : (company.currency || "EUR") })}>
              <SelectTrigger data-testid="co-region" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe o país" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PT">Portugal</SelectItem>
                <SelectItem value="BR">Brasil</SelectItem>
                <SelectItem value="OUTRO">Outro</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label className="text-xs text-muted-foreground">Moeda</Label>
            <Select value={company.currency || "EUR"} onValueChange={(v) => upC({ currency: v })}>
              <SelectTrigger data-testid="co-currency" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe a moeda" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">Euro (€)</SelectItem>
                <SelectItem value="BRL">Real brasileiro (R$)</SelectItem>
                <SelectItem value="USD">Dólar americano ($)</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label className="text-xs text-muted-foreground">CAE (código de atividade)</Label>
            <Input data-testid="co-cae" value={prof.cae || ""} onChange={(e) => upProf({ cae: e.target.value })} placeholder="Ex: 70220" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Onde fica</Label>
            <Input data-testid="co-location" value={prof.location || ""} onChange={(e) => upProf({ location: e.target.value })} placeholder="Ex: Lisboa, Portugal" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Há quantos anos existe</Label>
            <Input data-testid="co-years" type="number" min="0" value={prof.years_active || ""} onChange={(e) => upProf({ years_active: Number(e.target.value) })} className="mt-1 bg-transparent" /></div>
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">Como é que a empresa ganha dinheiro?</Label>
            <Textarea data-testid="co-model" value={prof.business_model || ""} onChange={(e) => upProf({ business_model: e.target.value })} placeholder="Ex: vendemos bolos por encomenda e temos uma loja física" className="mt-1 bg-transparent" rows={2} /></div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-[#3B82F6] mb-3">Pessoas e clientes</p>
        <div className="grid md:grid-cols-2 gap-5 mb-8">
          <div><Label className="text-xs text-muted-foreground">Quantas pessoas trabalham contigo</Label>
            <Input data-testid="co-employees" type="number" min="0" value={company.employees_count || 0} onChange={(e) => upC({ employees_count: Number(e.target.value) })} className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Quantos clientes tens (mais ou menos)</Label>
            <Input data-testid="co-clients" type="number" min="0" value={company.clients_count || 0} onChange={(e) => upC({ clients_count: Number(e.target.value) })} className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">O teu maior cliente vale quanto das vendas? (%)</Label>
            <Input data-testid="co-bigclient" type="number" min="0" max="100" value={prof.biggest_client_pct || ""} onChange={(e) => upProf({ biggest_client_pct: Number(e.target.value) })} placeholder="Ex: 30" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Os clientes costumam voltar a comprar?</Label>
            <Select value={prof.client_recurrence || ""} onValueChange={(v) => upProf({ client_recurrence: v })}>
              <SelectTrigger data-testid="co-recurrence" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe" /></SelectTrigger>
              <SelectContent><SelectItem value="Sim, quase sempre">Sim, quase sempre</SelectItem><SelectItem value="Às vezes">Às vezes</SelectItem><SelectItem value="Raramente, são quase sempre novos">Raramente, são quase sempre novos</SelectItem></SelectContent>
            </Select></div>
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">A empresa funciona sem ti?</Label>
            <Select value={prof.founder_dependency || ""} onValueChange={(v) => upProf({ founder_dependency: v })}>
              <SelectTrigger data-testid="co-founder" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe" /></SelectTrigger>
              <SelectContent><SelectItem value="Dependem de mim para quase tudo">Dependem de mim para quase tudo</SelectItem><SelectItem value="Aguenta alguns dias sem mim">Aguenta alguns dias sem mim</SelectItem><SelectItem value="Aguenta semanas sem mim">Aguenta semanas sem mim</SelectItem><SelectItem value="É totalmente autónoma">É totalmente autónoma</SelectItem></SelectContent>
            </Select></div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-[#3B82F6] mb-3">Dinheiro</p>
        <div className="grid md:grid-cols-2 gap-5 mb-8">
          <div><Label className="text-xs text-muted-foreground">Dinheiro em caixa hoje</Label>
            <Input data-testid="co-cash" type="number" value={company.bank_balance || 0} onChange={(e) => upC({ bank_balance: Number(e.target.value) })} className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Preço médio do teu produto/serviço</Label>
            <Input data-testid="co-price" type="number" value={prof.avg_price || ""} onChange={(e) => upProf({ avg_price: Number(e.target.value) })} className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Tens dívidas ou empréstimos? Quanto?</Label>
            <Input data-testid="co-debt" type="number" value={prof.debt || ""} onChange={(e) => upProf({ debt: Number(e.target.value) })} placeholder="0 se não tens" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Qual é o teu maior custo por mês?</Label>
            <Input data-testid="co-cost" value={prof.biggest_cost || ""} onChange={(e) => upProf({ biggest_cost: e.target.value })} placeholder="Ex: salários, renda, matéria-prima" className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Dependes muito de um único fornecedor?</Label>
            <Select value={prof.supplier_dependency || ""} onValueChange={(v) => upProf({ supplier_dependency: v })}>
              <SelectTrigger data-testid="co-supplier" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe" /></SelectTrigger>
              <SelectContent><SelectItem value="Sim, muito">Sim, muito</SelectItem><SelectItem value="Um pouco">Um pouco</SelectItem><SelectItem value="Não, tenho vários">Não, tenho vários</SelectItem></SelectContent>
            </Select></div>
          <div><Label className="text-xs text-muted-foreground">Há meses muito melhores ou piores?</Label>
            <Input data-testid="co-season" value={prof.seasonality || ""} onChange={(e) => upProf({ seasonality: e.target.value })} placeholder="Ex: verão é forte, janeiro é fraco" className="mt-1 bg-transparent" /></div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-[#3B82F6] mb-3">Objetivos e futuro</p>
        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">O que queres para a empresa?</Label>
            <Select value={prof.main_goal || ""} onValueChange={(v) => upProf({ main_goal: v })}>
              <SelectTrigger data-testid="co-goal" className="mt-1 bg-transparent"><SelectValue placeholder="Escolhe" /></SelectTrigger>
              <SelectContent><SelectItem value="Crescer o mais possível">Crescer o mais possível</SelectItem><SelectItem value="Estabilizar e ter mais lucro">Estabilizar e ter mais lucro</SelectItem><SelectItem value="Preparar para vender">Preparar para vender</SelectItem><SelectItem value="Trabalhar menos / mais liberdade">Trabalhar menos / mais liberdade</SelectItem></SelectContent>
            </Select></div>
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">O teu objetivo pessoal (porque fazes isto)</Label>
            <Textarea data-testid="co-personal" value={prof.personal_goal || ""} onChange={(e) => upProf({ personal_goal: e.target.value })} placeholder="Ex: dar segurança à família e ter tempo livre" className="mt-1 bg-transparent" rows={2} /></div>
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">O que te distingue da concorrência?</Label>
            <Textarea data-testid="co-advantage" value={prof.advantage || ""} onChange={(e) => upProf({ advantage: e.target.value })} placeholder="Ex: atendimento personalizado e entregas rápidas" className="mt-1 bg-transparent" rows={2} /></div>
          <div className="md:col-span-2"><Label className="text-xs text-muted-foreground">Qual é a tua maior preocupação neste momento?</Label>
            <Textarea data-testid="co-worry" value={prof.main_worry || ""} onChange={(e) => upProf({ main_worry: e.target.value })} placeholder="Ex: as vendas pararam de crescer" className="mt-1 bg-transparent" rows={2} /></div>
        </div>

        <Button data-testid="save-company-btn" onClick={saveCompany} disabled={savingCompany} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
          {savingCompany ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Guardar informação da empresa
        </Button>
      </div>

      <div className="surface rounded-3xl p-8 space-y-6 mb-6">
        <h2 className="font-serif-lux text-2xl">O teu CEO</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs text-muted-foreground">Personalidade / Modo</Label>
            <Select value={settings.ceo_mode} onValueChange={(v) => update({ ceo_mode: v })}>
              <SelectTrigger data-testid="set-mode" className="mt-1 bg-transparent capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Modelo de IA</Label>
            <Select value={settings.model} onValueChange={(v) => update({ model: v })}>
              <SelectTrigger data-testid="set-model" className="mt-1 bg-transparent"><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tom do briefing</Label>
            <Select value={settings.briefing_tone} onValueChange={(v) => update({ briefing_tone: v })}>
              <SelectTrigger data-testid="set-tone" className="mt-1 bg-transparent capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Assuntos no briefing</Label>
            <Input data-testid="set-count" type="number" min="1" max="8" value={settings.briefing_count} onChange={(e) => update({ briefing_count: Number(e.target.value) })} className="mt-1 bg-transparent" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tema visual</Label>
            <Select value={settings.theme} onValueChange={(v) => update({ theme: v })}>
              <SelectTrigger data-testid="set-theme" className="mt-1 bg-transparent capitalize"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="dark">Escuro (Obsidiana)</SelectItem><SelectItem value="light">Claro</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <Button data-testid="save-settings-btn" onClick={save} disabled={saving} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Guardar
        </Button>
      </div>

      <div className="surface rounded-3xl p-8 mb-6">
        <div className="flex items-center gap-2 mb-2"><Mail className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Briefing por email</h2></div>
        <p className="text-muted-foreground text-sm mb-6">O CEO AI 2.0 acorda contigo: recebe o briefing diário no email às 07:00 (UTC), mesmo sem abrir a app.</p>
        <div className="flex items-center justify-between p-4 rounded-xl border border-border mb-4">
          <div>
            <div className="text-sm font-medium">Enviar briefing diário por email</div>
            <div className="text-xs text-muted-foreground mt-0.5">Enviado para a tua conta de email</div>
          </div>
          <button data-testid="email-briefing-toggle" onClick={() => toggleEmail(!settings.email_briefing)}
            className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${settings.email_briefing ? "bg-[#3B82F6]" : "bg-border"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.email_briefing ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl border border-border mb-4">
          <div>
            <div className="text-sm font-medium">Resumo mensal do valor da empresa</div>
            <div className="text-xs text-muted-foreground mt-0.5">No início de cada mês recebes por email se o valor da tua empresa subiu ou desceu</div>
          </div>
          <button data-testid="email-value-alert-toggle" onClick={() => toggleValueAlert(!settings.email_value_alert)}
            className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${settings.email_value_alert ? "bg-[#3B82F6]" : "bg-border"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.email_value_alert ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl border border-border mb-4">
          <div>
            <div className="text-sm font-medium">Avisos de prazos de apoios e incentivos</div>
            <div className="text-xs text-muted-foreground mt-0.5">Recebes um email quando faltarem poucos dias (14/7/3/1) para o prazo de uma candidatura que estás a acompanhar</div>
          </div>
          <button data-testid="email-grant-alert-toggle" onClick={() => toggleGrantAlert(settings.email_grant_alerts === false)}
            className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${settings.email_grant_alerts !== false ? "bg-[#3B82F6]" : "bg-border"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.email_grant_alerts !== false ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <Button data-testid="send-email-now-btn" onClick={sendNow} disabled={sendingEmail} variant="outline" className="rounded-full">
          {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Enviar-me o briefing agora
        </Button>
        <Button data-testid="send-value-email-btn" onClick={sendValueNow} disabled={sendingVal} variant="outline" className="rounded-full ml-0 sm:ml-3 mt-3 sm:mt-0">
          {sendingVal ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Enviar-me o resumo de valor
        </Button>
      </div>

      <div className="mb-6">
        <ReportsUploader />
      </div>

      <div className="surface rounded-3xl p-8" data-testid="push-card">
        <div className="flex items-center gap-2 mb-2"><BellRing className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Notificações no telemóvel</h2></div>
        <p className="text-muted-foreground text-sm mb-6">Ativa as notificações neste dispositivo para receberes alertas do CEO (valor da empresa, riscos críticos). No iPhone: primeiro adiciona a app ao ecrã inicial (Partilhar → Adicionar ao Ecrã Principal) e abre-a a partir daí; as notificações aparecem também no Apple Watch emparelhado.</p>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="enable-push-btn" onClick={enablePush} disabled={pushBusy} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
            {pushBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BellRing className="w-4 h-4 mr-2" />} Ativar notificações
          </Button>
          <Button data-testid="test-push-btn" onClick={testPush} variant="outline" className="rounded-full">Enviar notificação de teste</Button>
        </div>
      </div>

      <div className="surface rounded-3xl p-8">
        <div className="flex items-center gap-2 mb-2"><Brain className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">CEO Memory</h2></div>
        <p className="text-muted-foreground text-sm mb-6">O que queres que o teu CEO nunca esqueça. Cada conselho vai considerar isto.</p>
        <div className="flex gap-3 mb-5">
          <Input data-testid="mem-input" value={newMem} onChange={(e) => setNewMem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMem()} placeholder="Ex: odeio empréstimos; quero contratar 2 técnicos" className="bg-transparent" />
          <Button data-testid="add-mem-btn" onClick={addMem} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="space-y-2">
          {memories.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem memórias.</p>}
          {memories.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border" data-testid={`mem-${m.id}`}>
              <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span className="flex-1 text-sm">{m.content}</span>
              <button onClick={() => delMem(m.id)} data-testid={`del-mem-${m.id}`} className="text-muted-foreground hover:text-[#EF4444] transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
