'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BRAND } from '../lib/brand';
import { useTenantBranding } from '../lib/useTenantBranding';

const API = BRAND.apiUrl;

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

export default function Shell({ title, children }: { title: string; children: ReactNode }) {
  const path = usePathname();
  const [billingChecked, setBillingChecked] = useState(path === '/billing');
  const [token, setToken] = useState<string | null>(null);
  const branding = useTenantBranding({ token });

  useEffect(() => {
    setToken(window.localStorage.getItem('token'));
  }, []);

  useEffect(() => {
    if (path === '/billing') {
      setBillingChecked(true);
      return;
    }

    const currentToken = window.localStorage.getItem('token');
    if (!currentToken) {
      setBillingChecked(true);
      return;
    }

    let alive = true;
    fetch(`${API}/billing`, {
      headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
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
    <div className="nl-shell" style={{ ['--accent' as any]: branding.primaryColor || '#1565FF' }}>
      {branding.customCss ? <style dangerouslySetInnerHTML={{ __html: branding.customCss }} /> : null}
      <aside className="nl-sidebar">
        <a href="/" className="nl-brand" aria-label={branding.name}>
          <img src={branding.logoUrl || BRAND.logoLight} alt={branding.name} />
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
