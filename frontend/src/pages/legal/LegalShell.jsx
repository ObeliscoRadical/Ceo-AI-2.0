import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export const CONTACT_EMAIL = "obeliscoradical@gmail.com";
export const COMPANY_NAME = "CEO AI 2.0";

export function LegalShell({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-background text-foreground relative z-10 grain">
      <div className="max-w-[820px] mx-auto px-6 py-16">
        <Link to="/login" data-testid="legal-back" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[#3B82F6] transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="font-serif-lux text-5xl mb-2">{title}</h1>
        {updated && <p className="text-xs text-muted-foreground mb-10">Última atualização: {updated}</p>}
        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-serif-lux [&_h2]:text-2xl [&_h2]:mt-8 [&_h2]:mb-2 [&_strong]:text-foreground">
          {children}
        </div>
        <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
          ⚠️ Este documento é um modelo inicial. Recomendamos revisão por um profissional jurídico antes do lançamento comercial.
        </div>
      </div>
    </div>
  );
}
