import { BRAND } from '../lib/brand';

const shortcuts = [
  { icon: 'dashboard', href: '/dashboard', title: 'Dashboard', description: 'Métricas reais da operação.' },
  { icon: 'sessions', href: '/sessoes', title: 'Conexões', description: 'Estado das instâncias Evolution conectadas.' },
  { icon: 'agent', href: '/agentes', title: 'Agentes', description: 'Prompt, modelo e roteamento ativo por projeto.' },
  { icon: 'inbox', href: '/inbox', title: 'Inbox', description: 'Conversas ao vivo com IA e atendimento humano.' },
  { icon: 'pipeline', href: '/pipeline', title: 'Pipeline', description: 'Funil visual para acompanhar e mover leads.' },
  { icon: 'billing', href: '/billing', title: 'Assinatura', description: 'Status de cobrança, planos e limites de uso.' },
];

function AppHomeIcon({ name }: { name: string }) {
  const path = {
    dashboard: 'M5 6h8v8H5V6Zm14 0h8v6h-8V6ZM5 20h8v6H5v-6Zm14-2h8v8h-8v-8Z',
    sessions: 'M16 5C9.9 5 5 9.4 5 14.8c0 2.5 1.1 4.8 2.8 6.5L6.5 27l5.7-1.6c1.2.4 2.5.6 3.8.6 6.1 0 11-4.4 11-9.8S22.1 5 16 5Z',
    agent: 'M9 10h14a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-4l-3 4-3-4H9a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Zm4-5h6v3h-6V5Z',
    inbox: 'M7 8h18v12H14l-7 6V8Z',
    pipeline: 'M6 8h20l-8 9v7l-4 3V17L6 8Z',
    billing: 'M5 8h22v16H5V8Zm3 6h16M9 19h8',
  }[name] || 'M6 23h20M8 20V9m8 11V5m8 15v-8';

  return (
    <svg className="nl-app-icon nl-app-icon--feature" viewBox="0 0 32 32" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="nl-app-entry nl-app-entry--clean">
      <section className="nl-app-entry__hero nl-app-entry__hero--clean">
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
