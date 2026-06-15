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
        <rect x="5" y="5" width="9" height="9" rx="2.5" />
        <rect x="18" y="5" width="9" height="7" rx="2.5" />
        <rect x="5" y="18" width="9" height="9" rx="2.5" />
        <rect x="18" y="16" width="9" height="11" rx="2.5" />
      </svg>
    );
  }

  if (name === 'sessions') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 4.5C9.65 4.5 4.5 9.2 4.5 15c0 2.72 1.14 5.2 3 7.05L6.1 27.5l5.62-1.5A12.4 12.4 0 0 0 16 26.5c6.35 0 11.5-4.7 11.5-10.5S22.35 4.5 16 4.5Z" />
        <path className="nl-app-icon__knockout" d="M12.6 10.65c-.55.35-1.35 1.18-1.35 2.55 0 3.55 3.82 7.55 7.4 7.55 1.42 0 2.3-.78 2.65-1.35l-2.3-2.15-1.25 1.05c-1.6-.58-3-1.98-3.58-3.58l1.05-1.25-2.62-2.82Z" />
      </svg>
    );
  }

  if (name === 'agent') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8.7 7.2A5.2 5.2 0 0 1 13.9 2h4.2a5.2 5.2 0 0 1 5.2 5.2v1.2h.8A4.9 4.9 0 0 1 29 13.3v6.2a4.9 4.9 0 0 1-4.9 4.9h-1.9L17.8 29a2.55 2.55 0 0 1-3.6 0l-4.4-4.6H7.9A4.9 4.9 0 0 1 3 19.5v-6.2a4.9 4.9 0 0 1 4.9-4.9h.8V7.2Z" />
        <circle className="nl-app-icon__knockout" cx="12.2" cy="16.1" r="2" />
        <circle className="nl-app-icon__knockout" cx="19.8" cy="16.1" r="2" />
        <path className="nl-app-icon__knockout" d="M12.4 20.2h7.2a3.9 3.9 0 0 1-7.2 0Z" />
      </svg>
    );
  }

  if (name === 'inbox') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 8.8A5.8 5.8 0 0 1 11.8 3h8.4A5.8 5.8 0 0 1 26 8.8v5.7a5.8 5.8 0 0 1-5.8 5.8h-3.85L9 27v-7.15a5.78 5.78 0 0 1-3-5.08V8.8Z" />
        <rect className="nl-app-icon__knockout" x="11.2" y="10.4" width="10" height="2.5" rx="1.25" />
        <rect className="nl-app-icon__knockout" x="11.2" y="15" width="7" height="2.5" rx="1.25" />
      </svg>
    );
  }

  if (name === 'pipeline') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 8h18l-7.2 8.4v6.2L14.2 25v-8.6L7 8Z" />
        <path className="nl-app-icon__line" d="M22.5 22h4M24.5 20v4" />
      </svg>
    );
  }

  if (name === 'billing') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5.5" y="8" width="21" height="16" rx="4" />
        <path className="nl-app-icon__line" d="M7.5 13.5h17M11 19h7" />
        <path className="nl-app-icon__line" d="m21 20 2 2 4-4" />
      </svg>
    );
  }

  return (
    <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="7" y="14" width="4" height="10" rx="2" />
      <rect x="14" y="8" width="4" height="16" rx="2" />
      <rect x="21" y="11" width="4" height="13" rx="2" />
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
