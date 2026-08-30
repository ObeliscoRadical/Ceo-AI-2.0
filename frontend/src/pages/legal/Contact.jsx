import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { fetchPublicSections } from "@/lib/publicSite";
import { applyPublicSeo } from "@/lib/seo";
import { trackPublicSurface } from "@/lib/publicSite";
import { LegalShell, CONTACT_EMAIL } from "./LegalShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [intro, setIntro] = useState(`Preferes email direto? ${CONTACT_EMAIL}`);

  useEffect(() => {
    fetchPublicSections(["contact.hero_intro"])
      .then((sections) => {
        setIntro(sections["contact.hero_intro"]?.value || `Preferes email direto? ${CONTACT_EMAIL}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    applyPublicSeo({ title: "CEO AI 2.0 | Contacto", description: intro, canonicalPath: "/contacto" });
    trackPublicSurface("contact", "/contacto", "Contacto").catch(() => {});
  }, [intro]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/contact", form);
      setSent(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Erro ao enviar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LegalShell title="Fala connosco">
      <p className="flex items-center gap-2" data-testid="contact-public-intro"><Mail className="w-4 h-4 text-[#3B82F6]" /> <span>{intro}</span></p>

      {sent ? (
        <div className="mt-6 p-6 rounded-2xl border border-[#10B981]/40 bg-[#10B981]/10 flex items-center gap-3" data-testid="contact-success">
          <CheckCircle2 className="w-6 h-6 text-[#10B981] shrink-0" />
          <p className="text-foreground">Mensagem recebida! Respondemos o mais breve possível.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 max-w-md">
          <div><Label className="text-xs text-muted-foreground">Nome</Label><Input data-testid="contact-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><Input data-testid="contact-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="mt-1 bg-transparent" /></div>
          <div><Label className="text-xs text-muted-foreground">Mensagem</Label><Textarea data-testid="contact-message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required className="mt-1 bg-transparent min-h-[120px]" /></div>
          <Button data-testid="contact-submit" type="submit" disabled={loading} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar mensagem"}
          </Button>
        </form>
      )}
    </LegalShell>
  );
}
