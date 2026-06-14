import { BRAND } from '../lib/brand';

const shortcuts = [
  { icon: 'dashboard', href: '/dashboard', title: 'Dashboard', description: 'Métricas, funil, campanhas e leitura rápida da operação.' },
  { icon: 'sessions', href: '/sessoes', title: 'Sessões', description: 'Estado das instâncias Evolution conectadas.' },
  { icon: 'agent', href: '/agentes', title: 'Agentes', description: 'Prompt, modelo e roteamento ativo por projeto.' },
  { icon: 'inbox', href: '/inbox', title: 'Inbox', description: 'Conversas ao vivo com IA e atendimento humano.' },
  { icon: 'pipeline', href: '/pipeline', title: 'Pipeline', description: 'Funil visual para acompanhar e mover leads.' },
  { icon: 'billing', href: '/billing', title: 'Assinatura', description: 'Status de cobrança, planos e limites de uso.' },
];

function AppHomeIcon({ name }: { name: string }) {
  if (name === 'dashboard') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <rect className="nl-app-icon__soft" x="7" y="7" width="34" height="34" rx="11" />
        <rect className="nl-app-icon__main-fill" x="13" y="14" width="7" height="8" rx="2.2" />
        <rect className="nl-app-icon__main-fill" x="24" y="11" width="11" height="5.5" rx="2" />
        <rect className="nl-app-icon__main-fill" x="13" y="27" width="11" height="7" rx="2" />
        <rect className="nl-app-icon__main-fill" x="28" y="22" width="7" height="12" rx="2.2" />
      </svg>
    );
  }

  if (name === 'sessions') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <path className="nl-app-icon__soft" d="M24 7.5c9.1 0 16.5 6.55 16.5 14.65S33.1 36.8 24 36.8c-2.25 0-4.4-.4-6.36-1.13L9.2 40.5l2.22-8.05a13.57 13.57 0 0 1-3.92-10.3C7.5 14.05 14.9 7.5 24 7.5Z" />
        <path className="nl-app-icon__main-stroke" d="M18.3 16.7c.55 8.15 5.25 12.7 12.8 13.45l2.75-3.65-5.08-2.43-1.7 2.18c-2.95-.95-5.15-2.95-6.15-6.08l2.1-1.72-2.5-5.06-2.22 3.31Z" />
      </svg>
    );
  }

  if (name === 'agent') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <rect className="nl-app-icon__soft" x="9" y="13" width="30" height="24" rx="10" />
        <path className="nl-app-icon__main-stroke" d="M24 13V8.5" />
        <circle className="nl-app-icon__main-fill" cx="24" cy="8" r="3" />
        <rect className="nl-app-icon__main-stroke" x="12" y="15" width="24" height="19" rx="8" />
        <path className="nl-app-icon__main-stroke" d="M16.5 24h.1M31.4 24h.1M19.5 28.7c2.55 2 6.45 2 9 0" />
      </svg>
    );
  }

  if (name === 'inbox') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <path className="nl-app-icon__soft" d="M11 13.5A7.5 7.5 0 0 1 18.5 6h11A7.5 7.5 0 0 1 37 13.5V22a7.5 7.5 0 0 1-7.5 7.5h-5.2L14.8 37v-8.15A7.48 7.48 0 0 1 11 22v-8.5Z" />
        <path className="nl-app-icon__main-stroke" d="M15.5 14.5A5.5 5.5 0 0 1 21 9h7a5.5 5.5 0 0 1 5.5 5.5v5.2A5.5 5.5 0 0 1 28 25.2h-4.9L16 31v-7.05a5.5 5.5 0 0 1-.5-2.25v-7.2Z" />
        <path className="nl-app-icon__main-stroke" d="M21 16.2h7M21 20.4h4.5" />
      </svg>
    );
  }

  if (name === 'pipeline') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <path className="nl-app-icon__soft" d="M10 10h28L27 23.4V34l-6 4V23.4L10 10Z" />
        <path className="nl-app-icon__main-stroke" d="M12 12h24L26 24.2V34l-4 2.7V24.2L12 12Z" />
        <path className="nl-app-icon__main-stroke" d="M32 31h6M35 28v6" />
      </svg>
    );
  }

  if (name === 'billing') {
    return (
      <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
        <rect className="nl-app-icon__soft" x="9" y="12" width="30" height="24" rx="8" />
        <rect className="nl-app-icon__main-stroke" x="11" y="14" width="26" height="20" rx="6" />
        <path className="nl-app-icon__main-stroke" d="M11.5 20.5h25M17 27.5h9" />
        <circle className="nl-app-icon__main-fill" cx="31.5" cy="27.5" r="2.3" />
      </svg>
    );
  }

  return (
    <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 48 48" aria-hidden="true">
      <path className="nl-app-icon__main-stroke" d="M14 34V20M24 34V12M34 34V24M12 36h24" />
    </svg>
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
          <img className="nl-app-entry__hero-art" src="/brand/comunora/comunora-app-hero-visual.png" alt="" />
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
