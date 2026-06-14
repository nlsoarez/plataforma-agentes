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
        <rect x="3.5" y="3.5" width="7" height="8.5" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="5.5" rx="2" />
        <rect x="3.5" y="15" width="7" height="5.5" rx="2" />
        <rect x="13.5" y="12" width="7" height="8.5" rx="2" />
      </svg>
    );
  }

  if (name === 'sessions') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.3c3.55 0 6.6 1.86 8.25 4.62a1.55 1.55 0 0 1-.54 2.12 1.5 1.5 0 0 1-2.06-.53A6.5 6.5 0 0 0 12 6.3a6.5 6.5 0 0 0-5.65 3.21 1.5 1.5 0 0 1-2.06.53 1.55 1.55 0 0 1-.54-2.12A9.57 9.57 0 0 1 12 3.3Z" />
        <path d="M12 8.8c1.8 0 3.35.9 4.26 2.28a1.42 1.42 0 0 1-.43 1.98 1.37 1.37 0 0 1-1.9-.43A2.28 2.28 0 0 0 12 11.7c-.8 0-1.53.36-1.94.94a1.37 1.37 0 0 1-1.9.42 1.42 1.42 0 0 1-.42-1.97A5.1 5.1 0 0 1 12 8.8Z" />
        <rect x="7" y="15" width="10" height="5.5" rx="2.25" />
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
        <path d="M5 5.7A4.2 4.2 0 0 1 9.2 1.5h5.6A4.2 4.2 0 0 1 19 5.7v5.1a4.2 4.2 0 0 1-4.2 4.2h-2.7l-5.5 4.7A1 1 0 0 1 5 19v-4.5a4.18 4.18 0 0 1-2-3.6V5.7h2Z" />
        <rect className="nl-home__icon-hole" x="8.2" y="7" width="7.6" height="1.55" rx=".78" />
        <rect className="nl-home__icon-hole" x="8.2" y="10.1" width="5.2" height="1.55" rx=".78" />
      </svg>
    );
  }

  if (name === 'pipeline') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.4 4.3c-.8 0-1.24.93-.72 1.54l6.18 7.26v5.76c0 .84.98 1.3 1.63.78l3.15-2.52c.24-.19.37-.48.37-.78V13.1l6.19-7.26a.94.94 0 0 0-.72-1.54H4.4Z" />
      </svg>
    );
  }

  if (name === 'billing') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.4A3.4 3.4 0 0 1 7.4 4h9.2A3.4 3.4 0 0 1 20 7.4v9.2a3.4 3.4 0 0 1-3.4 3.4H7.4A3.4 3.4 0 0 1 4 16.6V7.4Zm2.4 2.1h11.2V7.4a1 1 0 0 0-1-1H7.4a1 1 0 0 0-1 1v2.1Zm2 4.2a1.1 1.1 0 1 0 0 2.2h4.5a1.1 1.1 0 1 0 0-2.2H8.4Z" />
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
