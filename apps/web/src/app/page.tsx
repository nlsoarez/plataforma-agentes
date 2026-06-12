import { BRAND } from '../lib/brand';

const shortcuts = [
  { href: '/dashboard', title: 'Dashboard', description: 'Métricas, funil, campanhas e leitura rápida da operação.' },
  { href: '/sessoes', title: 'Sessões', description: 'Estado das instâncias Evolution conectadas.' },
  { href: '/agentes', title: 'Agentes', description: 'Prompt, modelo e roteamento ativo por projeto.' },
  { href: '/inbox', title: 'Inbox', description: 'Conversas ao vivo com IA e atendimento humano.' },
  { href: '/pipeline', title: 'Pipeline', description: 'Funil visual para acompanhar e mover leads.' },
  { href: '/billing', title: 'Assinatura', description: 'Status de cobrança, planos e limites de uso.' },
];

export default function Home() {
  return (
    <main className="nl-app-home">
      <section className="nl-app-home__hero">
        <img src={BRAND.logoDark} alt={BRAND.name} />
        <h1>{BRAND.tagline}</h1>
        <p>{BRAND.shortDescription}</p>
        <div className="nl-filterbar">
          <a className="nl-pill active" href="/login">Entrar</a>
          <a className="nl-pill" href={BRAND.siteUrl}>Site institucional</a>
        </div>
      </section>

      <section className="nl-grid nl-app-home__grid">
        {shortcuts.map((item) => (
          <a key={item.href} href={item.href} className="nl-card nl-card--pad nl-rise">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
