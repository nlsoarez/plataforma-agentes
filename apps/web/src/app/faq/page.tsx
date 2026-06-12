import type { Metadata } from 'next';
import { PublicArticle, PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

const faqs = [
  {
    question: 'O que é a Comunora?',
    answer:
      'A Comunora é uma plataforma de atendimento inteligente que conecta WhatsApp, inteligência artificial, CRM, automações, campanhas e atendimento humano em uma única operação.',
  },
  {
    question: 'A Comunora usa WhatsApp oficial?',
    answer:
      'A plataforma foi preparada para operar com Evolution API como camada de conexão com WhatsApp. A configuração técnica depende do ambiente contratado e das políticas aplicáveis ao uso do canal.',
  },
  {
    question: 'Posso usar minha própria chave de IA?',
    answer:
      'Sim. A Comunora foi desenhada para BYOK, permitindo que cada cliente configure provedores de IA compatíveis, como OpenAI e Anthropic, conforme disponibilidade no painel.',
  },
  {
    question: 'O atendimento pode passar para uma pessoa?',
    answer:
      'Sim. O agente pode orientar a conversa e, quando necessário, encaminhar ou pausar a automação para intervenção humana.',
  },
  {
    question: 'A Comunora possui CRM e funil comercial?',
    answer:
      'Sim. A plataforma organiza leads, conversas e oportunidades em pipeline para ajudar no acompanhamento comercial.',
  },
  {
    question: 'Agências podem usar white-label?',
    answer:
      'Sim. A Comunora preserva recursos de marca, domínio, logo, cores e configurações para operações white-label.',
  },
  {
    question: 'Como funciona a cobrança?',
    answer:
      'A assinatura é gerenciada pelo painel de cobrança integrado. O acesso a recursos pagos depende da confirmação da assinatura e do status financeiro da conta.',
  },
  {
    question: 'Como falo com o suporte?',
    answer: `Você pode entrar em contato pelo e-mail ${BRAND.supportEmail}.`,
  },
];

export const metadata: Metadata = {
  title: `FAQ | ${BRAND.name}`,
  description: 'Perguntas frequentes sobre a Comunora, plataforma de atendimento inteligente para WhatsApp.',
};

export default function FaqPage() {
  return (
    <PublicSiteLayout>
      <PublicArticle
        eyebrow="FAQ"
        title="Perguntas frequentes"
        description="Respostas diretas sobre funcionamento, IA, WhatsApp, cobrança e suporte."
      >
        <div className="nl-legal__faq">
          {faqs.map((item) => (
            <section key={item.question}>
              <h2>{item.question}</h2>
              <p>{item.answer}</p>
            </section>
          ))}
        </div>
      </PublicArticle>
    </PublicSiteLayout>
  );
}
