import { PublicSiteLayout } from '../../components/PublicSiteLayout';
import { BRAND } from '../../lib/brand';

const modules = [
  {
    icon: 'whatsapp',
    title: 'WhatsApp conectado',
    description: 'QR Code, inbox e respostas em tempo real com configuração automática pelo painel.',
  },
  {
    icon: 'bot',
    title: 'Agentes de IA',
    description: 'Atendimento automatizado com modelos BYOK, prompts por projeto e passagem para humano.',
  },
  {
    icon: 'users',
    title: 'CRM e pipeline',
    description: 'Leads, etapas, responsáveis, histórico de conversas e oportunidades organizadas.',
  },
  {
    icon: 'send',
    title: 'Automações e campanhas',
    description: 'Gatilhos, mensagens segmentadas, cadência e operação comercial em uma só plataforma.',
  },
];

const operationItems = [
  ['shield', 'Segurança e', 'conformidade'],
  ['users', 'Controle', 'humano'],
  ['plug', 'Integrações', 'poderosas'],
  ['tag', 'White-label', 'completo'],
  ['chart', 'Dados que', 'geram resultado'],
];

function Icon({ name }: { name: string }) {
  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.6 19.1 3 20l1-3.5a8 8 0 1 1 2.6 2.6Z" />
        <path d="M8.7 8.3c.2-.5.4-.6.7-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.4.5c-.1.2-.2.4 0 .6.5.9 1.2 1.7 2.2 2.2.2.1.4.1.6-.1l.6-.5c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.6v.4c0 .3-.1.6-.5.8-.6.3-1.5.5-2.5.2-2.6-.7-5.4-3.3-6.1-6-.2-.7 0-1.3.2-1.9Z" />
      </svg>
    );
  }

  if (name === 'bot') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v3" />
        <rect x="5" y="7" width="14" height="11" rx="4" />
        <path d="M8 12h.01M16 12h.01M9.5 16h5" />
        <path d="M4 11H2.5M21.5 11H20" />
      </svg>
    );
  }

  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15.5 10.5a2.5 2.5 0 1 0 0-5" />
        <path d="M3.5 19c.5-3.2 2.2-5 5-5s4.6 1.8 5 5" />
        <path d="M13.5 14.4c2.6.2 4.3 1.8 4.8 4.6" />
      </svg>
    );
  }

  if (name === 'send') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 12 16-8-5 16-3.2-6.8L4 12Z" />
        <path d="m11.8 13.2 4.7-4.7" />
      </svg>
    );
  }

  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5.2c0 4.3 2.7 7.8 7 9.8 4.3-2 7-5.5 7-9.8V6l-7-3Z" />
      </svg>
    );
  }

  if (name === 'plug') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4v5M16 4v5M7 9h10v3a5 5 0 0 1-10 0V9Z" />
        <path d="M12 17v3M9 20h6" />
      </svg>
    );
  }

  if (name === 'tag') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m20 12-8 8-8-8V4h8l8 8Z" />
        <path d="M8 8h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" />
      <path d="M4 19h16" />
    </svg>
  );
}

function HeroMockup() {
  return (
    <div className="nl-site__mockup" aria-label="Resumo da operação Comunora">
      <div className="nl-site__mockup-shell">
        <aside className="nl-site__mockup-sidebar">
          <img src={BRAND.logoLight} alt="" />
          {['Dashboard', 'Conversas', 'Contatos', 'Agentes de IA', 'Automação', 'Campanhas', 'Pipeline', 'Relatórios'].map(
            (item, index) => (
              <span key={item} className={index === 0 ? 'active' : ''}>
                <i />
                {item}
              </span>
            ),
          )}
        </aside>
        <section className="nl-site__mockup-board">
          <header>
            <b>Resumo da operação</b>
            <small>Últimos 7 dias</small>
          </header>
          <div className="nl-site__stats">
            {[
              ['Conversas', '1.250', '+ 12,5%'],
              ['Atendimentos', '532', '+ 8,2%'],
              ['Novos contatos', '842', '+ 16,8%'],
              ['Negócios', '320', '+ 10,5%'],
            ].map(([label, value, delta]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <em>{delta}</em>
              </article>
            ))}
          </div>
          <div className="nl-site__charts">
            <article>
              <b>Conversas por canal</b>
              <div className="nl-site__donut" />
            </article>
            <article>
              <b>Atendimentos por dia</b>
              <div className="nl-site__line-chart">
                <i style={{ height: '30%' }} />
                <i style={{ height: '48%' }} />
                <i style={{ height: '58%' }} />
                <i style={{ height: '42%' }} />
                <i style={{ height: '70%' }} />
                <i style={{ height: '62%' }} />
                <i style={{ height: '90%' }} />
              </div>
            </article>
          </div>
        </section>
      </div>

      <img className="nl-site__people" src="/brand/comunora/comunora-hero-people.png" alt="" />

      <div className="nl-site__chat">
        <div>
          <b>Agente de IA</b>
          <span>online</span>
        </div>
        <p>Olá! Como posso ajudar sua equipe hoje?</p>
        <p>Posso te ajudar a criar uma automação para qualificar seus leads.</p>
      </div>

      <span className="nl-site__float nl-site__float--whatsapp">
        <Icon name="whatsapp" />
      </span>
      <span className="nl-site__float nl-site__float--bot">
        <Icon name="bot" />
      </span>
      <span className="nl-site__float nl-site__float--growth">
        <Icon name="chart" />
      </span>
      <span className="nl-site__float nl-site__float--message">•••</span>
    </div>
  );
}

export default function SitePage() {
  return (
    <PublicSiteLayout>
      <section className="nl-site__hero">
        <div className="nl-site__hero-copy">
          <h1>
            Comunicação inteligente.
            <span>Resultados</span>
            reais.
          </h1>
          <p>{BRAND.institutionalDescription}</p>
          <div className="nl-site__actions">
            <a className="nl-btn nl-btn--accent" href={BRAND.appUrl}>Acessar plataforma</a>
            <a className="nl-btn nl-btn--ghost" href={`mailto:${BRAND.supportEmail}`}>Falar com suporte</a>
          </div>
        </div>
        <HeroMockup />
      </section>

      <section id="plataforma" className="nl-site__modules">
        <div className="nl-site__section-head">
          <h2>Uma base única para atendimento e vendas</h2>
          <p>Sem trocar de ferramenta para cada etapa da conversa.</p>
        </div>
        <div className="nl-site__module-grid">
          {modules.map((module) => (
            <article key={module.title}>
              <i className={`nl-site__module-icon nl-site__module-icon--${module.icon}`}>
                <Icon name={module.icon} />
              </i>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="operacao" className="nl-site__band">
        <div>
          <h2>
            Projetada para <span>operação real</span>, não para demonstração bonita.
          </h2>
          <p>
            A Comunora combina automação, controle humano, cobrança, integrações e white-label para empresas que precisam
            vender e atender pelo WhatsApp com organização.
          </p>
        </div>
        <div className="nl-site__band-items">
          {operationItems.map(([icon, first, second]) => (
            <article key={`${first}-${second}`}>
              <Icon name={icon} />
              <b>{first}<br />{second}</b>
            </article>
          ))}
        </div>
      </section>
    </PublicSiteLayout>
  );
}
