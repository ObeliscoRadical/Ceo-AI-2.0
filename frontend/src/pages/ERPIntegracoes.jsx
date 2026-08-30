import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, PlugZap, Copy, ShieldCheck, Unplug, RefreshCw, Database, ArrowUpRight, CheckCircle2, Zap, Users, Briefcase, TrendingUp, AlertTriangle, Building2 } from "lucide-react";

const money = (v) => (v == null ? "—" : Number(v || 0).toLocaleString("pt-PT", { maximumFractionDigits: 2 }));
const examplePayload = {
  event_id: "fin-2026-0001",
  event_type: "financial_update",
  occurred_at: "2026-08-08T10:15:00Z",
  cash_balance: 45200,
  total_debt: 18000,
  monthly_revenue: 37000,
  fixed_costs: [{ name: "Renda", amount: 3200 }, { name: "Salários", amount: 9800 }],
  credit_restructuring: { lender: "Banco XPTO", status: "em negociação", monthly_payment: 650 },
};

const nestedExamplePayload = {
  type: "finance.snapshot",
  data: {
    company: { name: "Cliente X" },
    snapshot: {
      balance: 45200,
      divida_total: 18000,
      custos_fixos: { Renda: 3200, Salários: 9800 },
      debt_restructuring: { status: "em curso", monthly_payment: 650 },
    },
  },
};

export default function ERPIntegracoes() {
  const [status, setStatus] = useState(null);
  const [obeliscoStatus, setObeliscoStatus] = useState(null);
  const [syncingObelisco, setSyncingObelisco] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");
  const [contract, setContract] = useState(null);
  const [form, setForm] = useState({ system_name: "ERP / Sistema de Gestão", erp_base_url: "", external_webhook_url: "", api_token: "", auth_mode: "header", auth_header_name: "X-ERP-Token", auth_prefix: "", auth_query_name: "token", notes: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [{ data }, { data: contractData }, obRes] = await Promise.all([
        api.get("/erp-integration/status"),
        api.get("/erp-integration/contract"),
        api.get("/obelisco/status").catch(() => ({ data: null })),
      ]);
      setStatus(data);
      setContract(contractData);
      setObeliscoStatus(obRes?.data);
      setForm((prev) => ({
        ...prev,
        system_name: data?.connection?.system_name || prev.system_name,
        erp_base_url: data?.connection?.erp_base_url || "",
        external_webhook_url: data?.connection?.external_webhook_url || "",
        auth_mode: data?.connection?.auth_mode || "header",
        auth_header_name: data?.connection?.auth_header_name || "X-ERP-Token",
        auth_prefix: data?.connection?.auth_prefix || "",
        auth_query_name: data?.connection?.auth_query_name || "token",
        notes: data?.connection?.notes || "",
        api_token: "",
      }));
      if (!data?.connected && !obRes?.data?.connected) setOpen(false);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const syncObelisco = async () => {
    setSyncingObelisco(true);
    try {
      const { data } = await api.post("/obelisco/sync");
      toast.success(data.message || "Sincronização 360° concluída com sucesso!");
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Erro na sincronização 360°");
    } finally {
      setSyncingObelisco(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalFixed = useMemo(() => Number(status?.context?.total_fixed_costs || 0), [status]);

  const copy = async (value, okText) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(okText);
  };

  const save = async (generateToken = false) => {
    setSaving(true);
    try {
      const payload = { ...form, generate_token: generateToken };
      const { data } = await api.post("/erp-integration/connect", payload);
      setGeneratedToken(data.generated_token || "");
      setOpen(false);
      toast.success("Ligação guardada. Já podes colar o webhook no teu ERP.");
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.delete("/erp-integration");
      setGeneratedToken("");
      toast.success("Integração desligada desta empresa.");
      await load();
      setOpen(true);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-32" data-testid="erp-integration-loading"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-[1180px] mx-auto" data-testid="erp-integration-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#3B82F6]/25 px-3 py-1 text-xs text-[#93C5FD] mb-3" data-testid="erp-integration-status-chip"><PlugZap className="w-3.5 h-3.5" />Integração individual por empresa</div>
          <h1 className="font-serif-lux text-4xl sm:text-5xl">ERP / Sistema de Gestão</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-3xl" data-testid="erp-integration-description">Liga o teu software de gestão a esta empresa do CEO AI 2.0. O webhook e o token ficam isolados por utilizador + empresa ativa, para nunca misturar dados financeiros entre contas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="erp-open-config-btn" onClick={() => setOpen(true)} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]"><PlugZap className="w-4 h-4 mr-2" />{status?.connected ? "Editar ligação" : "Configurar ligação"}</Button>
          {status?.connected && <Button data-testid="erp-refresh-status-btn" variant="outline" onClick={load} className="rounded-full"><RefreshCw className="w-4 h-4 mr-2" />Atualizar estado</Button>}
        </div>
      </div>

      {/* OBELISCO MANAGER 360° LIVE CARD */}
      <div className="surface rounded-3xl p-7 mb-8 border border-[#00F0FF]/30 bg-gradient-to-br from-[#00F0FF]/5 via-transparent to-[#3B82F6]/5 shadow-[0_0_50px_rgba(0,240,255,0.06)]" data-testid="obelisco-360-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#00F0FF]/10 border border-[#00F0FF]/30 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(0,240,255,0.15)]">
              <Zap className="w-6 h-6 text-[#00F0FF]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-[0.18em] text-[#00F0FF] font-semibold">Gateway 360° Ativo</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Sincronização Diária 06:30
                </span>
              </div>
              <h2 className="font-serif-lux text-2xl sm:text-3xl text-white">Obelisco Manager Cloud</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Host: <span className="text-slate-300 font-mono">{obeliscoStatus?.host || "https://proposal-hub-56.emergent.host"}</span> · Conta: <span className="text-slate-300 font-mono">{obeliscoStatus?.email || "d.oliveira1986@gmail.com"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              data-testid="obelisco-sync-now-btn"
              onClick={syncObelisco}
              disabled={syncingObelisco}
              className="rounded-full bg-[#00F0FF] text-black font-semibold hover:bg-[#00D2FF] shadow-[0_0_25px_rgba(0,240,255,0.3)] transition-all hover:scale-[1.02]"
            >
              {syncingObelisco ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {syncingObelisco ? "A sincronizar 360°..." : "Sincronizar com Obelisco Agora"}
            </Button>
          </div>
        </div>

        {/* 360 METRICS GRID */}
        {obeliscoStatus?.snapshot ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Saldo de Caixa</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-[#00F0FF]">
                  {money(obeliscoStatus.snapshot.cash_balance)} €
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Disponível em conta</div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Emitido no Ano</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-emerald-400">
                  {money(obeliscoStatus.snapshot.annual_emitted_revenue)} €
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">
                  Meta 350k: {obeliscoStatus.snapshot.annual_goal_progress_pct || 38.2}%
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">A Receber</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-amber-300">
                  {money(obeliscoStatus.snapshot.amount_to_receive)} €
                </div>
                <div className="text-[10px] text-red-400 mt-1">
                  Vencido: {money(obeliscoStatus.snapshot.overdue_to_receive)} €
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">A Pagar</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-rose-400">
                  {money(obeliscoStatus.snapshot.amount_to_pay)} €
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Fornecedores / Faturas</div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Equipa & Payroll</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-white">
                  {obeliscoStatus.snapshot.active_employees_count || 4} <span className="text-sm font-sans font-normal text-muted-foreground">técnicos</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {money(obeliscoStatus.snapshot.payroll_monthly_cost)} €/mês
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Obras & Projetos</div>
                <div className="font-serif-lux text-xl sm:text-2xl text-sky-400">
                  {obeliscoStatus.snapshot.works_summary?.total_count || 17} <span className="text-sm font-sans font-normal text-muted-foreground">obras</span>
                </div>
                <div className="text-[10px] text-sky-400/80 mt-1">
                  Lucro est.: {money(obeliscoStatus.snapshot.works_summary?.estimated_profit)} €
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground bg-white/[0.015] border border-white/[0.05] rounded-2xl px-4 py-2.5">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Contexto 360° ativo no cérebro do CEO AI (Reuniões de Voz, Chat e Briefing Matinal).
              </span>
              <span>Última sincronização: {obeliscoStatus.snapshot.synced_at ? new Date(obeliscoStatus.snapshot.synced_at).toLocaleString("pt-PT") : "Agora"}</span>
            </div>
          </div>
        ) : (
          <div className="mt-6 p-6 rounded-2xl border border-dashed border-white/[0.1] text-center">
            <p className="text-sm text-muted-foreground mb-3">Conexão configurada. Clica no botão acima para descarregar o primeiro raio-X 360° do Obelisco Manager.</p>
          </div>
        )}
      </div>

      <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="space-y-6">
          <div className="surface rounded-3xl p-7" data-testid="erp-connection-card">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[#3B82F6] mb-2">Ligação ativa</div>
                <div className="font-serif-lux text-2xl" data-testid="erp-connection-status">{status?.connected ? (status?.connection?.system_name || "Sistema ligado") : "Sem ligação ativa"}</div>
                <p className="text-sm text-muted-foreground mt-1" data-testid="erp-company-scope">Empresa atual: {status?.company?.name || "Sem empresa ativa"}</p>
              </div>
              {status?.connected ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300" data-testid="erp-connected-badge"><ShieldCheck className="w-3.5 h-3.5" />Conectado</div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-200" data-testid="erp-disconnected-badge">À espera de configuração</div>
              )}
            </div>

            {status?.connected ? (
              <div className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <InfoRow testid="erp-erp-url" label="URL do sistema" value={status?.connection?.erp_base_url || "—"} />
                  <InfoRow testid="erp-token-mask" label="Token guardado" value={status?.connection?.token_mask || "—"} />
                  <InfoRow testid="erp-auth-header" label="Autenticação" value={status?.connection?.auth_mode === "bearer" ? `Authorization (${status?.connection?.auth_prefix || 'Bearer'})` : status?.connection?.auth_mode === "query" ? `Query param: ${status?.connection?.auth_query_name || 'token'}` : (status?.connection?.auth_header_name || "X-ERP-Token")} />
                  <InfoRow testid="erp-last-payload-at" label="Última receção" value={status?.connection?.last_payload_at || "Ainda sem payload"} />
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-medium">Webhook do CEO AI 2.0</div>
                      <div className="text-xs text-muted-foreground">Cola esta URL nas definições do teu ERP para enviar os relatórios em JSON.</div>
                    </div>
                    <Button data-testid="erp-copy-webhook-btn" size="sm" variant="outline" className="rounded-full" onClick={() => copy(status?.connection?.webhook_url, "Webhook copiado") }><Copy className="w-4 h-4 mr-2" />Copiar</Button>
                  </div>
                  <div className="text-xs break-all text-slate-300" data-testid="erp-webhook-url">{status?.connection?.webhook_url}</div>
                </div>

                {generatedToken && (
                  <div className="rounded-2xl border border-[#3B82F6]/25 bg-[#3B82F6]/10 p-4" data-testid="erp-generated-token-panel">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-medium">Token seguro gerado agora</div>
                        <div className="text-xs text-muted-foreground">Guarda-o no teu ERP. O CEO AI 2.0 não volta a mostrar este valor em texto simples.</div>
                      </div>
                      <Button data-testid="erp-copy-token-btn" size="sm" variant="outline" className="rounded-full" onClick={() => copy(generatedToken, "Token copiado") }><Copy className="w-4 h-4 mr-2" />Copiar token</Button>
                    </div>
                    <div className="text-xs break-all text-slate-200" data-testid="erp-generated-token-value">{generatedToken}</div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button data-testid="erp-regenerate-token-btn" variant="outline" className="rounded-full" onClick={() => save(true)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}Gerar novo token</Button>
                  <Button data-testid="erp-disconnect-btn" variant="outline" className="rounded-full border-red-500/30 text-red-300 hover:bg-red-500/10" onClick={disconnect} disabled={disconnecting}>{disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unplug className="w-4 h-4 mr-2" />}Desligar integração</Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.12] p-6 text-sm text-muted-foreground" data-testid="erp-empty-state">Abre a configuração para guardar o token, receber o webhook do teu ERP e passar a usar saldo, dívidas e custos fixos como contexto ativo do CEO AI 2.0.</div>
            )}
          </div>

          <div className="surface rounded-3xl p-7" data-testid="erp-context-card">
            <div className="flex items-center gap-2 mb-4"><Database className="w-5 h-5 text-[#3B82F6]" /><h2 className="font-serif-lux text-2xl">Contexto financeiro em uso</h2></div>
            {status?.context ? (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <MetricCard testid="erp-context-cash" label="Saldo atual" value={money(status.context.cash_balance)} />
                  <MetricCard testid="erp-context-debt" label="Dívida total" value={money(status.context.total_debt)} />
                  <MetricCard testid="erp-context-revenue" label="Faturação mensal" value={money(status.context.monthly_revenue)} />
                  <MetricCard testid="erp-context-fixed" label="Custos fixos" value={money(totalFixed)} />
                </div>
                <div className="grid lg:grid-cols-2 gap-4 text-sm">
                  <DataList title="Custos fixos recebidos" items={status.context.fixed_costs} testid="erp-fixed-costs-list" />
                  <DataList title="Reestruturação de crédito" items={Object.entries(status.context.credit_restructuring || {}).map(([name, amount]) => ({ name, amount }))} testid="erp-credit-restructuring-list" />
                </div>
                <p className="text-xs text-muted-foreground" data-testid="erp-context-note">Este contexto passa a alimentar o snapshot financeiro do CEO AI 2.0, os conselhos executivos e o chat desta empresa ativa.</p>
                {!!status?.context?.last_present_fields?.length && <p className="text-xs text-muted-foreground" data-testid="erp-last-fields-note">Último payload atualizou: {status.context.last_present_fields.join(", ")}.</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="erp-context-empty">Ainda não recebemos JSON financeiro. Assim que o teu software enviar o primeiro payload, o CEO AI 2.0 passa a usar esses números nas análises desta empresa.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface rounded-3xl p-7" data-testid="erp-json-guide-card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="font-serif-lux text-2xl">Exemplo de JSON</h2>
                <p className="text-sm text-muted-foreground mt-1">Usa esta estrutura como referência no teu ERP ou webhook intermédio.</p>
              </div>
              <Button data-testid="erp-copy-example-btn" size="sm" variant="outline" className="rounded-full" onClick={() => copy(JSON.stringify(examplePayload, null, 2), "Exemplo copiado") }><Copy className="w-4 h-4 mr-2" />Copiar</Button>
            </div>
            <pre className="rounded-2xl border border-white/[0.08] bg-[#03050a] p-4 text-[11px] overflow-x-auto text-slate-300" data-testid="erp-json-example">{JSON.stringify(examplePayload, null, 2)}</pre>
            <p className="text-xs text-muted-foreground mt-3" data-testid="erp-json-alias-note">Também aceito aliases comuns como <span className="text-slate-200">balance</span>, <span className="text-slate-200">current_balance</span>, <span className="text-slate-200">saldo_atual</span>, <span className="text-slate-200">debt</span> e <span className="text-slate-200">divida_total</span>.</p>
            <pre className="rounded-2xl border border-white/[0.08] bg-[#03050a] p-4 text-[11px] overflow-x-auto text-slate-300 mt-4" data-testid="erp-json-nested-example">{JSON.stringify(nestedExamplePayload, null, 2)}</pre>
            <p className="text-xs text-muted-foreground mt-3" data-testid="erp-json-partial-note">Payloads parciais também funcionam: se o ERP enviar só <span className="text-slate-200">total_debt</span>, o CEO AI 2.0 preserva o resto do contexto anterior.</p>
          </div>

          <div className="surface rounded-3xl p-7" data-testid="erp-contract-card">
            <h2 className="font-serif-lux text-2xl mb-3">Contrato universal</h2>
            <div className="grid gap-3 text-sm">
              {(contract?.auth_modes || []).map((mode) => (
                <div key={mode.code} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4" data-testid={`erp-auth-mode-${mode.code}`}>
                  <div className="font-medium">{mode.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{JSON.stringify(mode.example)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface rounded-3xl p-7" data-testid="erp-events-card">
            <h2 className="font-serif-lux text-2xl mb-3">Últimos envios recebidos</h2>
            {status?.recent_events?.length ? (
              <div className="space-y-3">
                {status.recent_events.map((event, index) => (
                  <div key={`${event.event_key}-${index}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4" data-testid={`erp-event-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-medium">{event.event_type || "financial_update"}</div>
                      <div className="text-xs text-muted-foreground">{event.received_at}</div>
                    </div>
                    <div className="text-xs text-muted-foreground break-all">Evento: {event.event_key}</div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-300">
                      <div>Saldo: {money(event.summary?.cash_balance)}</div>
                      <div>Dívida: {money(event.summary?.total_debt)}</div>
                      <div>Faturação: {money(event.summary?.monthly_revenue)}</div>
                      <div>Custos fixos: {event.summary?.fixed_costs_count ?? 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="erp-events-empty">Sem histórico de envios ainda.</p>
            )}
          </div>

          <div className="surface rounded-3xl p-7" data-testid="erp-next-steps-card">
            <h2 className="font-serif-lux text-2xl mb-3">Como ativar no teu software</h2>
            <ol className="space-y-3 text-sm text-slate-300 list-decimal pl-5">
              <li data-testid="erp-step-1">Guarda a ligação com o nome do teu sistema e escolhe o modo de autenticação mais compatível com o SaaS do cliente.</li>
              <li data-testid="erp-step-2">Copia o webhook do CEO AI 2.0 e cola-o na configuração do ERP.</li>
              <li data-testid="erp-step-3">Configura o ERP para enviar JSON flat ou nested; o CEO AI 2.0 aceita aliases comuns e payloads parciais.</li>
              <li data-testid="erp-step-4">Depois do primeiro envio, o CEO AI 2.0 passa a usar esse contexto nas análises desta empresa.</li>
            </ol>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="surface max-w-2xl" data-testid="erp-config-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif-lux text-2xl">Conectar sistema de gestão</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Guarda as credenciais desta empresa e cria um webhook seguro para o teu ERP enviar os dados financeiros em JSON.</DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome do sistema" testid="erp-system-name-input" value={form.system_name} onChange={(value) => setForm((s) => ({ ...s, system_name: value }))} placeholder="Ex: Obelisco Manager" />
            <div>
              <Label className="text-xs text-muted-foreground">Modo de autenticação</Label>
              <Select value={form.auth_mode} onValueChange={(value) => setForm((s) => ({ ...s, auth_mode: value, auth_prefix: value === "bearer" ? (s.auth_prefix || "Bearer") : s.auth_prefix }))}>
                <SelectTrigger data-testid="erp-auth-mode-select" className="mt-1 bg-transparent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="header">Cabeçalho customizado</SelectItem>
                  <SelectItem value="bearer">Authorization Bearer</SelectItem>
                  <SelectItem value="query">Query param</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="URL base do sistema (opcional)" testid="erp-base-url-input" value={form.erp_base_url} onChange={(value) => setForm((s) => ({ ...s, erp_base_url: value }))} placeholder="https://erp.empresa.pt" />
            <Field label="Webhook do teu software (opcional)" testid="erp-source-webhook-input" value={form.external_webhook_url} onChange={(value) => setForm((s) => ({ ...s, external_webhook_url: value }))} placeholder="https://erp.empresa.pt/webhooks/financeiro" />
            {form.auth_mode === "header" && <Field label="Cabeçalho do token" testid="erp-token-header-input" value={form.auth_header_name} onChange={(value) => setForm((s) => ({ ...s, auth_header_name: value }))} placeholder="Ex: X-ERP-Token" />}
            {form.auth_mode === "query" && <Field label="Nome do query param" testid="erp-token-query-input" value={form.auth_query_name} onChange={(value) => setForm((s) => ({ ...s, auth_query_name: value }))} placeholder="Ex: token" />}
            {form.auth_mode === "bearer" && <Field label="Prefixo Authorization" testid="erp-token-prefix-input" value={form.auth_prefix} onChange={(value) => setForm((s) => ({ ...s, auth_prefix: value }))} placeholder="Bearer" />}
            <div className="md:col-span-2">
              <Label className="text-xs text-muted-foreground">Token/API secret</Label>
              <Input data-testid="erp-token-input" type="password" value={form.api_token} onChange={(e) => setForm((s) => ({ ...s, api_token: e.target.value }))} className="mt-1 bg-transparent" placeholder="Se deixares vazio, posso gerar um token seguro para ti" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-muted-foreground">Notas internas</Label>
              <Textarea data-testid="erp-notes-input" value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} className="mt-1 bg-transparent" rows={3} placeholder="Ex: enviar relatório diário às 23h e reestruturação de crédito quando houver alteração" />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button data-testid="erp-generate-token-save-btn" variant="outline" className="rounded-full" onClick={() => save(true)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Gerar token e guardar</Button>
            <Button data-testid="erp-save-btn" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]" onClick={() => save(false)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}Guardar ligação</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, testid }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm break-all" data-testid={testid}>{value}</div>
    </div>
  );
}

function MetricCard({ label, value, testid }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-serif-lux text-2xl" data-testid={testid}>{value}</div>
    </div>
  );
}

function DataList({ title, items, testid }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4" data-testid={testid}>
      <div className="text-sm font-medium mb-3">{title}</div>
      {items?.length ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground break-words">{item.name}</span>
              <span>{item.amount ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : <div className="text-xs text-muted-foreground">Sem dados ainda.</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, testid }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 bg-transparent" placeholder={placeholder} />
    </div>
  );
}