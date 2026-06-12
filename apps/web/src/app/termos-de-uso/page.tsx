import type { Metadata } from 'next';
import { PublicArticle, PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

export const metadata: Metadata = {
  title: `Termos de Uso | ${BRAND.name}`,
  description: 'Termos de Uso da Comunora.',
};

export default function TermosDeUsoPage() {
  return (
    <PublicSiteLayout>
      <PublicArticle
        eyebrow="Termos de Uso"
        title="Regras para utilização da Comunora"
        description="Última atualização: 12 de junho de 2026."
      >
        <h2>1. Aceitação</h2>
        <p>
          Ao acessar ou utilizar a Comunora, o usuário declara que leu, compreendeu e concorda com estes Termos de Uso e
          com a Política de Privacidade.
        </p>

        <h2>2. Descrição do serviço</h2>
        <p>
          A Comunora oferece recursos para atendimento inteligente, conexão com WhatsApp, agentes de IA, CRM,
          automações, campanhas, gestão de conversas, integrações e atendimento humano.
        </p>

        <h2>3. Conta e responsabilidade</h2>
        <p>
          O usuário é responsável por manter informações corretas, proteger suas credenciais, controlar acessos da equipe
          e garantir que o uso da plataforma esteja de acordo com leis, políticas de terceiros e regras aplicáveis aos
          canais utilizados.
        </p>

        <h2>4. Uso permitido</h2>
        <p>
          É proibido usar a plataforma para atividades ilegais, abusivas, fraudulentas, envio de spam, violação de
          privacidade, engenharia reversa indevida, tentativa de exploração técnica ou qualquer prática que prejudique a
          Comunora, outros usuários ou terceiros.
        </p>

        <h2>5. Integrações de terceiros</h2>
        <p>
          Recursos como WhatsApp, provedores de IA, agenda, cobrança e e-mail dependem de serviços externos. O cliente é
          responsável por configurar credenciais válidas e observar os termos e limites desses provedores.
        </p>

        <h2>6. Planos, cobrança e acesso</h2>
        <p>
          O acesso a recursos pagos depende de assinatura ativa e confirmação de pagamento. A inadimplência, cancelamento
          ou falha de cobrança pode limitar ou suspender funcionalidades.
        </p>

        <h2>7. Disponibilidade</h2>
        <p>
          Buscamos manter a plataforma disponível e estável, mas interrupções podem ocorrer por manutenção, falhas de
          infraestrutura, incidentes, integrações externas ou eventos fora do controle razoável da Comunora.
        </p>

        <h2>8. Propriedade intelectual</h2>
        <p>
          A plataforma, marca, interfaces, códigos, textos, elementos visuais e demais componentes da Comunora pertencem
          à Comunora ou a seus licenciadores. O uso da plataforma não transfere propriedade intelectual ao cliente.
        </p>

        <h2>9. Encerramento</h2>
        <p>
          A Comunora pode suspender ou encerrar acesso em caso de violação destes Termos, risco operacional, uso abusivo,
          exigência legal ou inadimplência, sem prejuízo de outras medidas cabíveis.
        </p>

        <h2>10. Contato</h2>
        <p>
          Para dúvidas sobre estes Termos, entre em contato pelo e-mail{' '}
          <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.
        </p>
      </PublicArticle>
    </PublicSiteLayout>
  );
}
