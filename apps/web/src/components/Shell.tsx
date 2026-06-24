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

type IconName =
  | 'dashboard'
  | 'sessions'
  | 'agents'
  | 'ai'
  | 'leads'
  | 'inbox'
  | 'pipeline'
  | 'calendar'
  | 'knowledge'
  | 'campaigns'
  | 'integrations'
  | 'team'
  | 'whatsapp'
  | 'settings'
  | 'help'
  | 'logout';

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/sessoes', label: 'Conexões', icon: 'sessions' },
  { href: '/agentes', label: 'Agentes', icon: 'agents' },
  { href: '/ai-settings', label: 'IA e Custos', icon: 'ai' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { href: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
  { href: '/agenda', label: 'Agenda', icon: 'calendar' },
  { href: '/knowledge', label: 'Conhecimento', icon: 'knowledge' },
  { href: '/campanhas', label: 'Campanhas', icon: 'campaigns' },
  { href: '/integracoes', label: 'Integrações', icon: 'integrations' },
  { href: '/equipe', label: 'Equipe', icon: 'team' },
  { href: '/onboarding', label: 'Conectar WhatsApp', icon: 'whatsapp' },
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
          <Link href="/dashboard" className="nl-brand" aria-label={branding.name || BRAND.name}>
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
            <Link
              key={n.href}
              href={n.href}
              prefetch
              className={path === n.href ? 'active' : ''}
              title={collapsed ? n.label : undefined}
              aria-label={n.label}
            >
              <span className="nl-nav-icon" aria-hidden="true"><SidebarIcon name={n.icon} /></span>
              <span className="label">{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="nl-sidebar-foot">
          <Link
            href="/configuracoes"
            prefetch
            className={`nl-sidebar-action ${path === '/configuracoes' ? 'active' : ''}`}
            title={collapsed ? 'Configurações' : undefined}
            aria-label="Configurações"
          >
            <span className="nl-sidebar-action-icon" aria-hidden="true"><SidebarIcon name="settings" /></span>
            <span className="label">Configurações</span>
          </Link>
          <button
            className="nl-sidebar-action"
            type="button"
            onClick={() => setTutorialRequest((current) => current + 1)}
            title={collapsed ? 'Tutorial' : undefined}
            aria-label="Tutorial"
          >
            <span className="nl-sidebar-action-icon" aria-hidden="true"><SidebarIcon name="help" /></span>
            <span className="label">Tutorial</span>
          </button>
          <button className="nl-signout" onClick={sair} title={collapsed ? 'Sair' : undefined} aria-label="Sair">
            <span className="nl-sidebar-action-icon" aria-hidden="true"><SidebarIcon name="logout" /></span>
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

function SidebarIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'sessions':
      return <svg {...common}><path d="M7 8h10" /><path d="M7 12h10" /><path d="M9 16h6" /><rect x="4" y="4" width="16" height="16" rx="4" /></svg>;
    case 'agents':
      return <svg {...common}><rect x="5" y="8" width="14" height="10" rx="4" /><path d="M12 8V5" /><path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M10 16h4" /><path d="M8 21h8" /></svg>;
    case 'ai':
      return <svg {...common}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m18.4 5.6-2.1 2.1" /><path d="m7.7 16.3-2.1 2.1" /><circle cx="12" cy="12" r="4" /></svg>;
    case 'leads':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M16 7h4" /><path d="M16 12h4" /><path d="M16 17h4" /></svg>;
    case 'inbox':
      return <svg {...common}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 6h14l2 14H3L5 6Z" /></svg>;
    case 'pipeline':
      return <svg {...common}><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" /></svg>;
    case 'calendar':
      return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></svg>;
    case 'knowledge':
      return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z" /><path d="M8 6h8" /><path d="M8 10h7" /></svg>;
    case 'campaigns':
      return <svg {...common}><path d="M4 13V8a2 2 0 0 1 2-2h3l9-3v18l-9-3H6a2 2 0 0 1-2-2v-3Z" /><path d="M9 18v3" /><path d="M18 9a4 4 0 0 1 0 6" /></svg>;
    case 'integrations':
      return <svg {...common}><path d="M9 7H7a4 4 0 0 0 0 8h2" /><path d="M15 7h2a4 4 0 0 1 0 8h-2" /><path d="M8 12h8" /></svg>;
    case 'team':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M14 17a5 5 0 0 1 7 3" /></svg>;
    case 'whatsapp':
      return <svg {...common}><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.6-3.2A7.96 7.96 0 0 1 4 12Z" /><path d="M9 9c.4 3 2.1 4.7 5 5" /><path d="M9 9h1.2l.8 1.8-.7.7" /><path d="M14 14l.7-.7 1.8.8V15" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></svg>;
    case 'help':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.8 2c-.9.6-1.6 1.1-1.6 2.4" /><path d="M12 17h.01" /></svg>;
    case 'logout':
      return <svg {...common}><path d="M10 6H5v12h5" /><path d="M14 16l4-4-4-4" /><path d="M18 12H9" /></svg>;
    default:
      return null;
  }
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
