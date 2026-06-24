import type { Metadata } from 'next';
import { PublicArticle, PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

const faqs = [
  {
    question: 'O que e a Comunora?',
    answer:
      'A Comunora e uma plataforma de atendimento inteligente que conecta WhatsApp, inteligencia artificial, CRM, automacoes, campanhas, agenda e atendimento humano em uma unica operacao.',
  },
  {
    question: 'Para quais negocios a Comunora serve?',
    answer:
      'A plataforma atende negocios que dependem de conversa e relacionamento pelo WhatsApp, como nutricionistas, cabeleireiros, saloes, advogados, corretores de imoveis, clinicas, prestadores de servico e operacoes comerciais.',
  },
  {
    question: 'Como a conexao com WhatsApp funciona?',
    answer:
      'A conexao e feita pelo painel. O usuario escaneia o QR Code, a Comunora cria a instancia, configura o recebimento de mensagens e roteia as conversas para Inbox, agente e atendimento humano.',
  },
  {
    question: 'Cada numero pode ter seu proprio agente?',
    answer:
      'Sim. Cada conexao de WhatsApp pode ser vinculada a uma configuracao de agente, com prompt, provedor de IA, modelo, horario de funcionamento e status ativo ou pausado.',
  },
  {
    question: 'Posso pausar o agente?',
    answer:
      'Sim. Ao pausar, novas mensagens continuam chegando no Inbox, mas a IA nao responde automaticamente. Isso permite atendimento manual sem perder historico.',
  },
  {
    question: 'O agente pode funcionar apenas em horarios definidos?',
    answer:
      'Sim. Voce pode configurar uma janela de funcionamento. Fora desse periodo, o atendimento fica humano/manual.',
  },
  {
    question: 'A Comunora agenda reunioes ou consultas?',
    answer:
      'Sim. Com Google Calendar conectado, a plataforma pode consultar disponibilidade, criar eventos e apoiar fluxos de agendamento pelo WhatsApp.',
  },
  {
    question: 'A Comunora envia lembretes automaticos?',
    answer:
      'Sim. A agenda pode enviar lembrete antes do horario marcado. O cliente pode responder 1 para confirmar, 2 para remarcar ou 3 para cancelar.',
  },
  {
    question: 'A plataforma reativa leads parados?',
    answer:
      'Sim. A reativacao automatica pode identificar leads sem interacao por um periodo definido e enviar uma mensagem controlada, respeitando limite diario e janela de reenvio.',
  },
  {
    question: 'Posso usar minha propria chave de IA?',
    answer:
      'Sim. A Comunora usa o modelo BYOK, permitindo que cada cliente configure provedores compativeis, como OpenAI e Anthropic, conforme disponibilidade no painel.',
  },
  {
    question: 'O atendimento pode passar para uma pessoa?',
    answer:
      'Sim. O atendente pode assumir a conversa no Inbox, pausar a IA e continuar manualmente quando o caso exigir intervencao humana.',
  },
  {
    question: 'A Comunora possui CRM e funil comercial?',
    answer:
      'Sim. A plataforma organiza leads, conversas e oportunidades em pipeline para acompanhar etapas comerciais e historico de relacionamento.',
  },
  {
    question: 'Agencias podem usar white-label?',
    answer:
      'Sim. A Comunora preserva recursos de marca, dominio, logo, cores e configuracoes para operacoes white-label.',
  },
  {
    question: 'Como funciona a cobranca?',
    answer:
      'A assinatura e gerenciada pelo painel de cobranca integrado. O acesso a recursos pagos depende da confirmacao da assinatura e do status financeiro da conta.',
  },
  {
    question: 'Como falo com o suporte?',
    answer: `Voce pode entrar em contato pelo e-mail ${BRAND.supportEmail} ou abrir chamado dentro da area de Configuracoes.`,
  },
];

export const metadata: Metadata = {
  title: `FAQ | ${BRAND.name}`,
  description: 'Perguntas frequentes sobre a Comunora, plataforma de atendimento inteligente para WhatsApp, IA, CRM e agenda.',
};

export default function FaqPage() {
  return (
    <PublicSiteLayout>
      <PublicArticle
        eyebrow="FAQ"
        title="Perguntas frequentes"
        description="Respostas diretas sobre WhatsApp, IA, agenda, lembretes, reativacao, cobranca e suporte."
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
