'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BRAND } from '../lib/brand';
import ProductTour from './ProductTour';
import { useTenantBranding } from '../lib/useTenantBranding';

const API = BRAND.apiUrl;
const BILLING_CACHE_KEY = 'comunora.billing.ok';
const BILLING_CACHE_TTL = 5 * 60 * 1000;

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sessoes', label: 'Conexões' },
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
  { href: '/configuracoes', label: 'Configurações' },
  { href: '/settings', label: 'Marca' },
  { href: '/billing', label: 'Assinatura' },
  { href: '/onboarding', label: 'Conectar WhatsApp' },
];

export default function Shell({ children }: { title: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tutorialRequest, setTutorialRequest] = useState(0);
  const branding = useTenantBranding({ token });

  useEffect(() => {
    setToken(window.localStorage.getItem('token'));
  }, []);

  useEffect(() => {
    if (path === '/billing') return;
    if (hasFreshBillingCache()) return;

    const currentToken = window.localStorage.getItem('token');
    if (!currentToken) return;

    let alive = true;
    fetch(`${API}/billing`, {
      headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((billing) => {
        if (!alive) return;
        if (!billing?.pago) {
          clearBillingCache();
          router.replace('/billing');
          return;
        }
        setBillingCache();
      })
      .catch(() => null);

    return () => {
      alive = false;
    };
  }, [path, router]);

  function sair() {
    localStorage.removeItem('token');
    clearBillingCache();
    router.replace('/login');
  }

  return (
    <div className="nl-shell" style={{ ['--accent' as any]: branding.primaryColor || '#1565FF' }}>
      {branding.customCss ? <style dangerouslySetInnerHTML={{ __html: branding.customCss }} /> : null}
      <aside className="nl-sidebar">
        <Link href="/dashboard" className="nl-brand" aria-label={branding.name}>
          <img src={branding.logoUrl || BRAND.logoLight} alt={branding.name} />
        </Link>
        <nav className="nl-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} prefetch className={path === n.href ? 'active' : ''}>
              <span className="dot" /> <span className="label">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="nl-sidebar-foot">
          <button
            className="nl-tutorial-button"
            type="button"
            onClick={() => setTutorialRequest((current) => current + 1)}
          >
            Tutorial
          </button>
          <button className="nl-signout" onClick={sair}>Sair</button>
        </div>
      </aside>
      <div className="nl-main">
        <div className="nl-content">{children}</div>
      </div>
      <ProductTour path={path} request={tutorialRequest} />
    </div>
  );
}

function hasFreshBillingCache() {
  if (typeof window === 'undefined') return false;
  const raw = window.sessionStorage.getItem(BILLING_CACHE_KEY);
  if (!raw) return false;
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) && Date.now() - timestamp < BILLING_CACHE_TTL;
}

function setBillingCache() {
  window.sessionStorage.setItem(BILLING_CACHE_KEY, String(Date.now()));
}

function clearBillingCache() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(BILLING_CACHE_KEY);
}
