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

const dashboardNavItems = [
  ['dashboard', 'Dashboard'],
  ['message', 'Conversas'],
  ['contacts', 'Contatos'],
  ['bot', 'Agentes de IA'],
  ['plug', 'Automação'],
  ['send', 'Campanhas'],
  ['tag', 'Pipeline'],
  ['chart', 'Relatórios'],
];

function Icon({ name }: { name: string }) {
  if (name === 'whatsapp') {
    return (
      <svg className="nl-site__svg-fill" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.601 2.326A7.85 7.85 0 0 0 8.003 0C3.584 0 0 3.582 0 7.998a7.96 7.96 0 0 0 1.067 3.992L0 16l4.11-1.078a7.98 7.98 0 0 0 3.89.99h.003c4.418 0 8.002-3.582 8.002-7.998 0-2.137-.833-4.147-2.404-5.588ZM8.003 14.56a6.63 6.63 0 0 1-3.38-.925l-.243-.144-2.438.64.65-2.375-.158-.244a6.59 6.59 0 0 1-1.012-3.514c0-3.636 2.961-6.595 6.584-6.595a6.55 6.55 0 0 1 4.665 1.934 6.55 6.55 0 0 1 1.93 4.66c-.001 3.636-2.961 6.563-6.598 6.563Zm3.617-4.932c-.197-.099-1.17-.578-1.35-.644-.181-.066-.313-.099-.445.099-.132.197-.51.644-.626.776-.115.132-.23.148-.428.05-.197-.1-.833-.307-1.587-.98-.587-.523-.984-1.17-1.1-1.368-.115-.198-.012-.305.087-.403.09-.089.198-.23.297-.346.099-.115.132-.198.198-.33.066-.132.033-.247-.016-.346-.05-.099-.445-1.073-.61-1.47-.16-.386-.324-.333-.445-.34l-.38-.007c-.132 0-.346.05-.527.247-.181.198-.692.677-.692 1.65 0 .973.71 1.914.808 2.046.099.132 1.397 2.132 3.383 2.99.473.204.842.326 1.13.418.475.151.907.13 1.248.079.38-.057 1.17-.478 1.335-.94.165-.462.165-.858.115-.94-.05-.083-.181-.132-.379-.231Z" />
      </svg>
    );
  }

  if (name === 'bot') {
    return (
      <svg className="nl-site__svg-solid nl-site__svg-bot" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 3.9h2v3h-2z" />
        <circle cx="12" cy="3.8" r="2" />
        <path d="M4.25 10.4A2.4 2.4 0 0 1 6.65 8h10.7a2.4 2.4 0 0 1 2.4 2.4v5.15a4.7 4.7 0 0 1-4.7 4.7H8.95a4.7 4.7 0 0 1-4.7-4.7V10.4Z" />
        <path d="M2.15 12.35c0-.88.72-1.6 1.6-1.6h.65v5.5h-.65a1.6 1.6 0 0 1-1.6-1.6v-2.3ZM19.6 10.75h.65c.88 0 1.6.72 1.6 1.6v2.3c0 .88-.72 1.6-1.6 1.6h-.65v-5.5Z" />
        <circle className="nl-site__svg-hole" cx="8.9" cy="13.25" r="1.15" />
        <circle className="nl-site__svg-hole" cx="15.1" cy="13.25" r="1.15" />
        <path className="nl-site__svg-hole" d="M9.35 16.05h5.3a2.85 2.85 0 0 1-5.3 0Z" />
      </svg>
    );
  }

  if (name === 'users') {
    return (
      <svg className="nl-site__svg-solid nl-site__svg-users" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.6" r="3.1" />
        <circle cx="6.25" cy="9.45" r="2.65" />
        <circle cx="17.75" cy="9.45" r="2.65" />
        <path d="M4.1 19.6v-1.05c0-2.6 1.55-4.65 3.9-5.3.9.78 2.12 1.23 4 1.23s3.1-.45 4-1.23c2.35.65 3.9 2.7 3.9 5.3v1.05c0 .7-.5 1.18-1.25 1.18H5.35c-.75 0-1.25-.48-1.25-1.18Z" />
      </svg>
    );
  }

  if (name === 'send') {
    return (
      <svg className="nl-site__svg-solid nl-site__svg-send" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.4 11.7 20.7 3.4 14.9 20.8l-3.45-7.25L3.4 11.7Z" />
        <path className="nl-site__svg-hole" d="M11.15 13.9 16.95 7.95l-7.05 5.25 1.25.7Z" />
      </svg>
    );
  }

  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5.2c0 4.3 2.7 7.8 7 9.8 4.3-2 7-5.5 7-9.8V6l-7-3Z" />
        <path d="m9.2 12.2 1.9 1.9 3.9-4.2" />
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

  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
      </svg>
    );
  }

  if (name === 'message') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4.7a3.5 3.5 0 0 1-3.5 3.5h-4.1L6.4 19v-4.3A3.5 3.5 0 0 1 5 11.9V6.5Z" />
        <path d="M9 8h6M9 11h4" />
      </svg>
    );
  }

  if (name === 'contacts') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="14" height="16" rx="3" />
        <path d="M9 8h6M9 16h6" />
        <path d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
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
          {dashboardNavItems.map(([icon, label], index) => (
            <span key={label} className={index === 0 ? 'active' : ''}>
              <i>
                <Icon name={icon} />
              </i>
              {label}
            </span>
          ))}
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
