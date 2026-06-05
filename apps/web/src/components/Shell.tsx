'use client';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/campanhas', label: 'Campanhas' },
  { href: '/billing', label: 'Assinatura' },
  { href: '/onboarding', label: 'Conectar WhatsApp' },
];

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const path = usePathname();
  function sair() { localStorage.removeItem('token'); window.location.href = '/login'; }

  return (
    <div className="nl-shell">
      <aside className="nl-sidebar">
        <a href="/" className="nl-brand">
          <img src="/neural-lab-mark.png" alt="Neural Lab" />
          <b>Neural<span> Lab</span></b>
        </a>
        <nav className="nl-nav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={path === n.href ? 'active' : ''}>
              <span className="dot" /> <span className="label">{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="nl-sidebar-foot">
          <button className="nl-signout" onClick={sair}>Sair</button>
        </div>
      </aside>
      <div className="nl-main">
        <header className="nl-topbar">
          <div className="title">{title}</div>
        </header>
        <div className="nl-content">{children}</div>
      </div>
    </div>
  );
}
