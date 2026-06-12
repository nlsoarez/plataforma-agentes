export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Comunora',
  tagline: 'Comunicação inteligente. Resultados reais.',
  shortDescription:
    process.env.NEXT_PUBLIC_BRAND_SHORT_DESCRIPTION ||
    'Plataforma de atendimento inteligente que conecta WhatsApp, inteligência artificial, CRM, automações e atendimento humano em uma única operação.',
  institutionalDescription:
    'A Comunora simplifica a forma como empresas se comunicam, atendem e vendem pelo WhatsApp. A plataforma reúne inteligência artificial, CRM, automações, campanhas e gestão de conversas em um único ambiente, permitindo automatizar tarefas, organizar oportunidades e transferir o atendimento para uma pessoa sempre que necessário.',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://comunora.com.br',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.comunora.com.br',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.comunora.com.br',
  statusUrl: process.env.NEXT_PUBLIC_STATUS_URL || 'https://status.comunora.com.br',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'suporte@comunora.com.br',
  logoDark: '/brand/comunora/comunora-logo-horizontal-dark.svg',
  logoLight: '/brand/comunora/comunora-logo-horizontal-light.svg',
  symbol: '/brand/comunora/comunora-symbol.svg',
  symbolLight: '/brand/comunora/comunora-symbol-light.svg',
  favicon: '/brand/comunora/comunora-favicon.svg',
  ogImage: '/brand/comunora/comunora-og-image.png',
};

export type TenantBranding = {
  name: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  supportEmail: string;
  customCss?: string;
};

export function defaultBranding(): TenantBranding {
  return {
    name: BRAND.name,
    logoUrl: BRAND.logoLight,
    faviconUrl: BRAND.favicon,
    primaryColor: '#1565FF',
    supportEmail: BRAND.supportEmail,
  };
}
