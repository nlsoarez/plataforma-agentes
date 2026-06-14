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
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="6" width="8" height="8" rx="2.2" />
        <rect x="18" y="6" width="8" height="5.8" rx="2" />
        <rect x="6" y="18" width="8" height="8" rx="2.2" />
        <rect x="18" y="16" width="8" height="10" rx="2.2" />
      </svg>
    );
  }

  if (name === 'sessions') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 5.7c5.8 0 10.5 4.35 10.5 9.72 0 5.36-4.7 9.72-10.5 9.72-1.45 0-2.82-.27-4.07-.76L6.8 27l1.42-5.03a9.24 9.24 0 0 1-2.72-6.55C5.5 10.05 10.2 5.7 16 5.7Z" />
        <path d="M12.38 11.45c.42 5.25 3.45 8.2 8.25 8.75l1.74-2.18-3.25-1.55-1.08 1.35c-1.9-.62-3.28-1.9-3.94-3.9l1.35-1.08-1.62-3.24-1.45 1.85Z" />
      </svg>
    );
  }

  if (name === 'agent') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="9" y="9" width="14" height="14" rx="3.5" />
        <path d="M16 4.8V9M16 23v4.2M4.8 16H9M23 16h4.2M8.2 8.2l3 3M20.8 20.8l3 3M23.8 8.2l-3 3M11.2 20.8l-3 3" />
        <circle cx="16" cy="16" r="3.2" />
      </svg>
    );
  }

  if (name === 'inbox') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 9.2A4.2 4.2 0 0 1 11.2 5h9.6A4.2 4.2 0 0 1 25 9.2v5.9a4.2 4.2 0 0 1-4.2 4.2h-4.3L10 25v-6.2a4.2 4.2 0 0 1-3-4V9.2Z" />
        <path d="M12 11h8M12 15h5.8" />
      </svg>
    );
  }

  if (name === 'pipeline') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 8h18l-7.2 8.4v6.2L14.2 25v-8.6L7 8Z" />
        <path d="M22.5 22h4M24.5 20v4" />
      </svg>
    );
  }

  if (name === 'billing') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5.5" y="8" width="21" height="16" rx="4" />
        <path d="M6 13h20M11 19h7" />
        <path d="m21 20 2 2 4-4" />
      </svg>
    );
  }

  return (
    <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 24V12M16 24V8M24 24v-9M6 24h20" />
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
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 7.5v-3" />
              <circle cx="16" cy="4" r="1.8" />
              <rect x="7" y="10" width="18" height="14" rx="6" />
              <path d="M10.5 17h.01M21.5 17h.01M12.5 20.4c2.05 1.35 4.95 1.35 7 0" />
              <path d="M7 15H5.5A2.5 2.5 0 0 0 3 17.5v1A2.5 2.5 0 0 0 5.5 21H7M25 15h1.5a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5H25" />
            </svg>
          </span>
          <img className="nl-app-entry__operator" src="/brand/comunora/comunora-app-operator-cutout.png" alt="" />
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
