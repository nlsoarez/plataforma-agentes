'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sessoes', label: 'Sessões' },
  { href: '/agentes', label: 'Agentes' },
  { href: '/templates', label: 'Templates' },
  { href: '/ai-settings', label: 'IA e Custos' },
  { href: '/leads', label: 'Leads' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/knowledge', label: 'Conhecimento' },
  { href: '/automacoes', label: 'Automações' },
  { href: '/campanhas', label: 'Campanhas' },
  { href: '/integracoes', label: 'Integrações' },
  { href: '/api-docs', label: 'API Docs' },
  { href: '/equipe', label: 'Equipe' },
  { href: '/settings', label: 'Marca' },
  { href: '/billing', label: 'Assinatura' },
  { href: '/onboarding', label: 'Conectar WhatsApp' },
];

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const path = usePathname();
  const [billingChecked, setBillingChecked] = useState(path === '/billing');

  useEffect(() => {
    if (path === '/billing') {
      setBillingChecked(true);
      return;
    }

    const token = window.localStorage.getItem('token');
    if (!token) {
      setBillingChecked(true);
      return;
    }

    let alive = true;
    fetch(`${API}/billing`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((billing) => {
        if (!alive) return;
        if (!billing?.pago) {
          window.location.href = '/billing';
          return;
        }
        setBillingChecked(true);
      })
      .catch(() => setBillingChecked(true));

    return () => {
      alive = false;
    };
  }, [path]);

  function sair() {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  return (
    <div className="nl-shell">
      <aside className="nl-sidebar">
        <a href="/" className="nl-brand">
          <img src="/brand/attende-logo-horizontal-light.svg" alt="Attende" style={{ height: 32 }} />
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
        <div className="nl-content">
          {billingChecked ? children : (
            <div className="nl-card nl-card--pad">
              <div className="display display-md">Verificando assinatura</div>
              <p className="muted">Aguarde enquanto validamos seu acesso.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
