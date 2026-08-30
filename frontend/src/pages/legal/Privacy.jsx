import { LegalShell, COMPANY_NAME, CONTACT_EMAIL } from "./LegalShell";
import { useEffect } from "react";
import { applyPublicSeo } from "@/lib/seo";
import { trackPublicSurface } from "@/lib/publicSite";

export default function Privacy() {
  useEffect(() => {
    applyPublicSeo({ title: "CEO AI 2.0 | Privacidade", description: `Política de privacidade do CEO AI 2.0. Contacto ${CONTACT_EMAIL}.`, canonicalPath: "/privacidade" });
    trackPublicSurface("privacy", "/privacidade", "Privacidade").catch(() => {});
  }, []);

  return (
    <LegalShell title="Política de Privacidade (RGPD)" updated="23 de junho de 2026">
      <p>A tua privacidade é uma prioridade. Esta política explica que dados recolhemos, como os usamos e os teus direitos ao abrigo do Regulamento Geral sobre a Proteção de Dados (RGPD).</p>

      <h2>1. Responsável pelo tratamento</h2>
      <p>O {COMPANY_NAME} é o responsável pelo tratamento dos dados pessoais recolhidos na plataforma. Contacto: <strong>{CONTACT_EMAIL}</strong>.</p>

      <h2>2. Dados que recolhemos</h2>
      <p><strong>Conta:</strong> nome, email e (se aplicável) foto de perfil.<br/>
      <strong>Dados da empresa:</strong> informação financeira e operacional que introduzes ou importas (receitas, despesas, saldos, clientes, funcionários, documentos).<br/>
      <strong>Utilização:</strong> conversas com o assistente e configurações.<br/>
      <strong>Pagamento:</strong> processado pelo Stripe — não armazenamos dados completos do cartão.</p>

      <h2>3. Finalidades e base legal</h2>
      <p>Tratamos os teus dados para prestar o serviço (execução do contrato), processar pagamentos (obrigação contratual/legal) e melhorar a plataforma (interesse legítimo). Os dados financeiros são usados para gerar as tuas análises e o aconselhamento personalizado.</p>

      <h2>4. Inteligência artificial</h2>
      <p>Para gerar briefings, respostas e projeções, partes dos teus dados são enviados a fornecedores de IA (ex.: OpenAI, Anthropic, Google) através de uma chave gerida. Estes fornecedores processam os dados apenas para responder aos pedidos.</p>

      <h2>5. Partilha de dados</h2>
      <p>Não vendemos os teus dados. Partilhamos apenas com subprocessadores necessários (alojamento, pagamentos Stripe, fornecedores de IA), sujeitos a obrigações de confidencialidade.</p>

      <h2>6. Conservação</h2>
      <p>Conservamos os dados enquanto a conta estiver ativa. Podes solicitar a eliminação a qualquer momento.</p>

      <h2>7. Os teus direitos</h2>
      <p>Tens direito de acesso, retificação, eliminação, portabilidade, oposição e limitação do tratamento. Para exercer estes direitos, contacta <strong>{CONTACT_EMAIL}</strong>. Tens também o direito de apresentar queixa à autoridade de controlo (em Portugal, a CNPD).</p>

      <h2>8. Segurança</h2>
      <p>Aplicamos medidas técnicas e organizativas para proteger os teus dados, incluindo autenticação segura e comunicação encriptada.</p>
    </LegalShell>
  );
}
