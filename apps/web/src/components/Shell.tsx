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
const SIDEBAR_COLLAPSED_KEY = 'comunora.sidebar.collapsed.v1';

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
  { href: '/settings', label: 'Marca' },
  { href: '/billing', label: 'Assinatura' },
  { href: '/onboarding', label: 'Conectar WhatsApp' },
];

export default function Shell({ children }: { title: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tutorialRequest, setTutorialRequest] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const branding = useTenantBranding({ token });
  const sidebarLogo = branding.logoUrl && branding.logoUrl !== BRAND.logoLight
    ? branding.logoUrl
    : (BRAND.symbolLight || BRAND.symbol);
  const showBrandWord = !branding.logoUrl || branding.logoUrl === BRAND.logoLight;

  useEffect(() => {
    setToken(window.localStorage.getItem('token'));
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
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

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  function sair() {
    localStorage.removeItem('token');
    clearBillingCache();
    router.replace('/login');
  }

  return (
    <div
      className={`nl-shell ${collapsed ? 'nl-shell--collapsed' : ''}`}
      style={{ ['--accent' as any]: branding.primaryColor || '#1565FF' }}
    >
      {branding.customCss ? <style dangerouslySetInnerHTML={{ __html: branding.customCss }} /> : null}
      <aside className="nl-sidebar" aria-label="Navegação principal">
        <div className="nl-sidebar-head">
          <Link href="/dashboard" className="nl-brand" aria-label={branding.name}>
            <img src={sidebarLogo} alt="" aria-hidden="true" />
            {showBrandWord ? <span className="nl-brand-word">{branding.name || BRAND.name}</span> : null}
          </Link>
          <button
            className="nl-sidebar-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
          </button>
        </div>

        <nav className="nl-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} prefetch className={path === n.href ? 'active' : ''} title={collapsed ? n.label : undefined}>
              <span className="dot" /> <span className="label">{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="nl-sidebar-foot">
          <Link
            href="/configuracoes"
            prefetch
            className={`nl-sidebar-action ${path === '/configuracoes' ? 'active' : ''}`}
            title={collapsed ? 'Configurações' : undefined}
          >
            <span className="nl-sidebar-action-icon" aria-hidden="true">⚙</span>
            <span className="label">Configurações</span>
          </Link>
          <button
            className="nl-sidebar-action"
            type="button"
            onClick={() => setTutorialRequest((current) => current + 1)}
            title={collapsed ? 'Tutorial' : undefined}
          >
            <span className="nl-sidebar-action-icon" aria-hidden="true">?</span>
            <span className="label">Tutorial</span>
          </button>
          <button className="nl-signout" onClick={sair} title={collapsed ? 'Sair' : undefined}>
            <span className="nl-sidebar-action-icon" aria-hidden="true">↗</span>
            <span className="label">Sair</span>
          </button>
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
