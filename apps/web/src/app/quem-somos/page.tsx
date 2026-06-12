import type { Metadata } from 'next';
import { PublicArticle, PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

export const metadata: Metadata = {
  title: `Quem somos | ${BRAND.name}`,
  description:
    'Conheça a Comunora, plataforma de atendimento inteligente para WhatsApp com IA, CRM, automações, campanhas e atendimento humano.',
};

export default function QuemSomosPage() {
  return (
    <PublicSiteLayout>
      <PublicArticle
        eyebrow="Quem somos"
        title="Comunicação inteligente para transformar conversas em resultados"
        description="A Comunora nasceu para simplificar a forma como empresas se comunicam, atendem e vendem pelo WhatsApp."
      >
        <p>
          A <strong>Comunora</strong> nasceu para simplificar a forma como empresas se comunicam, atendem e vendem pelo
          WhatsApp.
        </p>
        <p>
          Somos uma plataforma de atendimento inteligente que reúne inteligência artificial, CRM, automações, campanhas
          e gestão de conversas em um único ambiente. Nossa tecnologia permite que empresas automatizem tarefas
          repetitivas, organizem oportunidades e mantenham um atendimento ágil, sem perder a possibilidade de
          intervenção humana quando necessário.
        </p>
        <p>
          Acreditamos que tecnologia eficiente não precisa ser complicada. Por isso, desenvolvemos uma solução
          acessível, flexível e preparada para diferentes tipos de negócio, desde profissionais autônomos e pequenas
          empresas até agências e operações que desejam oferecer a plataforma com sua própria marca.
        </p>
        <p>
          Na Comunora, cada conversa pode se transformar em relacionamento, oportunidade e resultado.
        </p>
        <p>
          <strong>Comunora — Comunicação inteligente. Resultados reais.</strong>
        </p>
      </PublicArticle>
    </PublicSiteLayout>
  );
}
