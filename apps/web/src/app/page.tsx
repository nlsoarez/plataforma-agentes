import { BRAND } from '../lib/brand';

const shortcuts = [
  { icon: 'dashboard', href: '/dashboard', title: 'Dashboard', description: 'Métricas, funil, campanhas e leitura rápida da operação.' },
  { icon: 'sessions', href: '/sessoes', title: 'Sessões', description: 'Estado das instâncias Evolution conectadas.' },
  { icon: 'agent', href: '/agentes', title: 'Agentes', description: 'Prompt, modelo e roteamento ativo por projeto.' },
  { icon: 'inbox', href: '/inbox', title: 'Inbox', description: 'Conversas ao vivo com IA e atendimento humano.' },
  { icon: 'pipeline', href: '/pipeline', title: 'Pipeline', description: 'Funil visual para acompanhar e mover leads.' },
  { icon: 'billing', href: '/billing', title: 'Assinatura', description: 'Status de cobrança, planos e limites de uso.' },
];

const navItems = ['Dashboard', 'Sessões', 'Agentes', 'Inbox', 'Pipeline', 'Contatos', 'Campanhas', 'Relatórios', 'Configurações'];

function AppHomeIcon({ name }: { name: string }) {
  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="7" rx="1.5" />
        <rect x="14" y="4" width="6" height="4" rx="1.5" />
        <rect x="4" y="15" width="6" height="5" rx="1.5" />
        <rect x="14" y="12" width="6" height="8" rx="1.5" />
      </svg>
    );
  }

  if (name === 'sessions') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.5 8.5a4 4 0 0 1 5.6 0l.4.4" />
        <path d="M7.2 6.2a7.3 7.3 0 0 1 9.6 0l.5.5" />
        <path d="M11.1 11.4a1.4 1.4 0 0 1 1.8 0" />
        <rect x="6" y="14" width="12" height="5" rx="2" />
      </svg>
    );
  }

  if (name === 'agent') {
    return (
      <svg className="nl-home__icon-solid" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 3.9h2v3h-2z" />
        <circle cx="12" cy="3.8" r="2" />
        <path d="M4.25 10.4A2.4 2.4 0 0 1 6.65 8h10.7a2.4 2.4 0 0 1 2.4 2.4v5.15a4.7 4.7 0 0 1-4.7 4.7H8.95a4.7 4.7 0 0 1-4.7-4.7V10.4Z" />
        <path d="M2.15 12.35c0-.88.72-1.6 1.6-1.6h.65v5.5h-.65a1.6 1.6 0 0 1-1.6-1.6v-2.3ZM19.6 10.75h.65c.88 0 1.6.72 1.6 1.6v2.3c0 .88-.72 1.6-1.6 1.6h-.65v-5.5Z" />
        <circle className="nl-home__icon-hole" cx="8.9" cy="13.25" r="1.15" />
        <circle className="nl-home__icon-hole" cx="15.1" cy="13.25" r="1.15" />
        <path className="nl-home__icon-hole" d="M9.35 16.05h5.3a2.85 2.85 0 0 1-5.3 0Z" />
      </svg>
    );
  }

  if (name === 'inbox') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.6A3.6 3.6 0 0 1 8.6 3h6.8A3.6 3.6 0 0 1 19 6.6v4.6a3.6 3.6 0 0 1-3.6 3.6h-3.9L6.4 19v-4.5A3.6 3.6 0 0 1 5 11.6v-5Z" />
        <path d="M9 8.4h6M9 11.3h4.5" />
      </svg>
    );
  }

  if (name === 'pipeline') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14l-5.4 6.2v5.4L10.4 19v-7.8L5 5Z" />
      </svg>
    );
  }

  if (name === 'billing') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8.4A2.4 2.4 0 0 1 7.4 6h9.2A2.4 2.4 0 0 1 19 8.4v7.2a2.4 2.4 0 0 1-2.4 2.4H7.4A2.4 2.4 0 0 1 5 15.6V8.4Z" />
        <path d="M5 10h14M8.2 14.8h3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7M4 19h16" />
    </svg>
  );
}

function AppDashboardMockup() {
  return (
    <div className="nl-app-entry__mockup" aria-hidden="true">
      <aside>
        <img src={BRAND.logoLight} alt="" />
        {navItems.map((item, index) => (
          <span key={item} className={index === 0 ? 'active' : ''}>
            <AppHomeIcon name={index === 0 ? 'dashboard' : index === 1 ? 'sessions' : index === 2 ? 'agent' : index === 3 ? 'inbox' : 'pipeline'} />
            {item}
          </span>
        ))}
      </aside>
      <section>
        <header>
          <div>
            <strong>Olá, João! 👋</strong>
            <small>Aqui está o resumo da sua operação hoje.</small>
          </div>
          <div className="nl-app-entry__top-actions">
            <span>Hoje</span>
            <i />
            <b />
          </div>
        </header>
        <div className="nl-app-entry__metrics">
          {[
            ['Conversas', '1.250', '↑ 12,5%'],
            ['Atendimentos', '532', '↑ 8,2%'],
            ['Novos Contatos', '842', '↑ 16,8%'],
            ['Negócios', '320', '↑ 10,5%'],
          ].map(([label, value, delta]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <em>{delta}</em>
            </article>
          ))}
        </div>
        <div className="nl-app-entry__charts">
          <article>
            <b>Conversas por canal</b>
            <div className="nl-app-entry__donut" />
          </article>
          <article>
            <b>Atendimentos por dia</b>
            <div className="nl-app-entry__line">
              <svg viewBox="0 0 220 118" preserveAspectRatio="none">
                <path d="M8 98 28 72 50 78 76 46 102 60 130 25 154 56 180 18 210 6" />
              </svg>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <main className="nl-app-entry">
      <div className="nl-app-entry__halo" />
      <section className="nl-app-entry__hero">
        <div className="nl-app-entry__copy">
          <img className="nl-app-entry__logo" src={BRAND.logoDark} alt={BRAND.name} />
          <h1>
            Comunicação inteligente.
            <span>Resultados reais.</span>
          </h1>
          <p>{BRAND.shortDescription}</p>
          <div className="nl-app-entry__actions">
            <a className="nl-btn nl-btn--accent" href="/login">Entrar</a>
            <a className="nl-btn nl-btn--ghost" href={BRAND.siteUrl}>Site institucional</a>
          </div>
        </div>

        <div className="nl-app-entry__visual">
          <AppDashboardMockup />
          <span className="nl-app-entry__bot-orb">
            <AppHomeIcon name="agent" />
          </span>
          <img className="nl-app-entry__operator" src="/brand/comunora/comunora-app-operator.png" alt="" />
        </div>
      </section>

      <section className="nl-app-entry__shortcuts" aria-label="Acessos rápidos">
        {shortcuts.map((item) => (
          <a key={item.href} href={item.href} className={`nl-app-entry__card nl-app-entry__card--${item.icon}`}>
            <i>
              <AppHomeIcon name={item.icon} />
            </i>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
