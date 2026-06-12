import type { ReactNode } from 'react';
import { BRAND } from '../lib/brand';

const navItems = [
  { href: '/quem-somos', label: 'Quem somos' },
  { href: '/faq', label: 'FAQ' },
  { href: '/politica-de-privacidade', label: 'Privacidade' },
  { href: '/termos-de-uso', label: 'Termos' },
];

export function PublicSiteLayout({ children }: { children: ReactNode }) {
  return (
    <main className="nl-site">
      <header className="nl-site__nav">
        <a href="/" aria-label={`${BRAND.name} - início`}>
          <img src={BRAND.logoDark} alt={BRAND.name} />
        </a>
        <nav>
          <a href="/#plataforma">Plataforma</a>
          <a href="/#operacao">Operação</a>
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
          <a className="nl-site__nav-cta" href={BRAND.appUrl}>Entrar</a>
        </nav>
      </header>
      {children}
      <footer className="nl-site__footer">
        <div>
          <img src={BRAND.logoDark} alt={BRAND.name} />
          <p>{BRAND.tagline}</p>
        </div>
        <nav aria-label="Links institucionais">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
          <a href={`mailto:${BRAND.supportEmail}`}>Contato</a>
        </nav>
      </footer>
    </main>
  );
}

export function PublicArticle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <article className="nl-legal">
      <header className="nl-legal__head">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      <div className="nl-legal__body">
        {children}
      </div>
    </article>
  );
}
