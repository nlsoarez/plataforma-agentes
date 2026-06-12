'use client';

import { useEffect, useMemo, useState } from 'react';
import { BRAND, TenantBranding, defaultBranding } from './brand';

const OLD_BRAND_RE = /(attende|neural[-\s_]?lab|command\s*center)/i;
const OLD_COLOR_RE = /^#?(22c55e|14b8a6|0f172a|020617)$/i;

function isOldBrandValue(value?: string | null) {
  return Boolean(value && OLD_BRAND_RE.test(value));
}

function cleanLogo(value: string | undefined, fallback: string) {
  if (!value || isOldBrandValue(value)) return fallback;
  return value;
}

function cleanColor(value: string | undefined, fallback: string) {
  if (!value || OLD_COLOR_RE.test(value)) return fallback;
  return value;
}

function normalizeBranding(payload: any, dark = false): TenantBranding {
  const fallback = defaultBranding();
  const fallbackLogo = dark ? BRAND.logoDark : fallback.logoUrl;
  return {
    name: isOldBrandValue(payload?.name || payload?.nome) ? fallback.name : payload?.name || payload?.nome || fallback.name,
    logoUrl: cleanLogo(payload?.logoUrl || payload?.logo_url, fallbackLogo),
    faviconUrl: cleanLogo(payload?.faviconUrl || payload?.favicon_url, fallback.faviconUrl),
    primaryColor: cleanColor(payload?.primaryColor || payload?.cor_primaria, fallback.primaryColor),
    supportEmail: isOldBrandValue(payload?.supportEmail || payload?.support_email)
      ? fallback.supportEmail
      : payload?.supportEmail || payload?.support_email || fallback.supportEmail,
    customCss: payload?.customCss || payload?.custom_css || '',
  };
}

export function useTenantBranding(options?: { token?: string | null; darkLogo?: boolean }) {
  const [branding, setBranding] = useState<TenantBranding>(() => normalizeBranding(null, options?.darkLogo));
  const api = BRAND.apiUrl;
  const token = options?.token;
  const darkLogo = Boolean(options?.darkLogo);

  useEffect(() => {
    let alive = true;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const endpoint = token
      ? `${api}/settings/tenant`
      : `${api}/branding?dominio=${encodeURIComponent(window.location.host)}`;

    fetch(endpoint, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (alive && payload) setBranding(normalizeBranding(payload, darkLogo));
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [api, token, darkLogo]);

  return useMemo(() => branding, [branding]);
}
