import type { Metadata } from 'next';
import { PublicArticle, PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

export const metadata: Metadata = {
  title: `Política de Privacidade | ${BRAND.name}`,
  description: 'Política de Privacidade da Comunora.',
};

export default function PoliticaDePrivacidadePage() {
  return (
    <PublicSiteLayout>
      <PublicArticle
        eyebrow="Política de Privacidade"
        title="Como tratamos dados na Comunora"
        description="Última atualização: 12 de junho de 2026."
      >
        <h2>1. Objetivo</h2>
        <p>
          Esta Política de Privacidade explica como a Comunora coleta, utiliza, armazena e protege informações
          relacionadas ao uso da plataforma, do site e dos serviços associados.
        </p>

        <h2>2. Dados que podemos coletar</h2>
        <p>
          Podemos coletar dados cadastrais, dados de autenticação, informações de pagamento, dados de uso da plataforma,
          registros técnicos, configurações de integrações e conteúdos necessários para operar atendimentos, conversas,
          automações, campanhas e CRM.
        </p>

        <h2>3. Finalidades de uso</h2>
        <p>
          Utilizamos dados para criar e manter contas, autenticar usuários, processar assinaturas, entregar recursos da
          plataforma, conectar integrações, prestar suporte, manter segurança, cumprir obrigações legais e melhorar a
          experiência do serviço.
        </p>

        <h2>4. Conversas e integrações</h2>
        <p>
          Quando o cliente conecta canais como WhatsApp, provedores de IA, agenda, cobrança ou outros sistemas, a
          Comunora processa as informações necessárias para executar as funcionalidades configuradas pelo próprio
          cliente.
        </p>

        <h2>5. Compartilhamento</h2>
        <p>
          Dados podem ser compartilhados com fornecedores essenciais para operação da plataforma, como hospedagem,
          processamento de pagamentos, envio de e-mails, provedores de IA, ferramentas de autenticação e integrações
          configuradas pelo cliente.
        </p>

        <h2>6. Segurança</h2>
        <p>
          Adotamos controles técnicos e organizacionais para proteger informações contra acesso não autorizado, perda,
          alteração ou uso indevido. Nenhuma medida, porém, elimina todos os riscos inerentes ao ambiente digital.
        </p>

        <h2>7. Retenção</h2>
        <p>
          Mantemos dados pelo tempo necessário para cumprir as finalidades descritas, obrigações legais, contratos,
          auditorias, prevenção a fraudes e defesa de direitos.
        </p>

        <h2>8. Direitos dos titulares</h2>
        <p>
          Titulares podem solicitar acesso, correção, exclusão, portabilidade, informações sobre tratamento e demais
          direitos previstos na legislação aplicável, observados limites técnicos, legais e contratuais.
        </p>

        <h2>9. Contato</h2>
        <p>
          Para dúvidas sobre privacidade, entre em contato pelo e-mail{' '}
          <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.
        </p>
      </PublicArticle>
    </PublicSiteLayout>
  );
}
