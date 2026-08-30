import { LegalShell, COMPANY_NAME, CONTACT_EMAIL } from "./LegalShell";
import { useEffect } from "react";
import { applyPublicSeo } from "@/lib/seo";
import { trackPublicSurface } from "@/lib/publicSite";

export default function Terms() {
  useEffect(() => {
    applyPublicSeo({ title: "CEO AI 2.0 | Termos", description: "Termos e condições do CEO AI 2.0.", canonicalPath: "/termos" });
    trackPublicSurface("terms", "/termos", "Termos").catch(() => {});
  }, []);

  return (
    <LegalShell title="Termos de Serviço" updated="23 de junho de 2026">
      <p>Bem-vindo ao {COMPANY_NAME}. Ao criar uma conta e utilizar a plataforma, aceitas estes Termos de Serviço. Se não concordares, não deves utilizar o serviço.</p>

      <h2>1. Descrição do serviço</h2>
      <p>O {COMPANY_NAME} é uma ferramenta de apoio à gestão empresarial que fornece análises, briefings, projeções e um assistente conversacional baseado em inteligência artificial. As análises, valores estimados e o "Investment Grade" são <strong>estimativas fundamentadas nos dados fornecidos pelo utilizador</strong> e não constituem aconselhamento financeiro, jurídico, contabilístico ou de investimento, nem uma avaliação pericial oficial.</p>

      <h2>2. Conta e responsabilidade</h2>
      <p>És responsável por manter a confidencialidade das tuas credenciais e por toda a atividade realizada na tua conta. Comprometes-te a fornecer informação verdadeira e a utilizar o serviço de acordo com a lei aplicável.</p>

      <h2>3. Subscrições e pagamentos</h2>
      <p>Existem planos gratuitos e planos Premium pagos. Os pagamentos são processados de forma segura através do Stripe. As subscrições renovam-se automaticamente no fim de cada período, salvo cancelamento. Podes cancelar a qualquer momento; o acesso mantém-se até ao fim do período já pago. Salvo indicação em contrário ou obrigação legal, os valores pagos não são reembolsáveis.</p>

      <h2>4. Utilização aceitável</h2>
      <p>Não podes utilizar o serviço para fins ilegais, para carregar conteúdo a que não tens direito, nem tentar comprometer a segurança ou integridade da plataforma.</p>

      <h2>5. Propriedade intelectual</h2>
      <p>O software, marca e conteúdos do {COMPANY_NAME} pertencem à empresa. Os dados que carregas continuam a ser teus; concedes-nos apenas as permissões necessárias para operar o serviço.</p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>O serviço é fornecido "tal como está". Na medida máxima permitida por lei, não somos responsáveis por decisões tomadas com base nas análises fornecidas nem por perdas indiretas resultantes do uso do serviço.</p>

      <h2>7. Alterações e cessação</h2>
      <p>Podemos atualizar estes Termos e o serviço. Podemos suspender contas que violem estes Termos. Serás informado de alterações materiais.</p>

      <h2>8. Contacto</h2>
      <p>Para qualquer questão, contacta-nos em <strong>{CONTACT_EMAIL}</strong>.</p>
    </LegalShell>
  );
}
