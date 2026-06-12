import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { BRAND } from '../lib/brand';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const title = 'Comunora | Atendimento inteligente com IA, CRM e WhatsApp';
const description =
  'Centralize conversas, automatize atendimentos com inteligência artificial, organize leads no CRM e conecte sua equipe ao WhatsApp com a Comunora.';

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title,
  description,
  applicationName: BRAND.name,
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'black-translucent',
  },
  keywords: ['Comunora', 'WhatsApp', 'CRM', 'IA', 'atendimento inteligente', 'automação de atendimento'],
  alternates: {
    canonical: BRAND.siteUrl,
  },
  openGraph: {
    title,
    description,
    url: BRAND.siteUrl,
    siteName: BRAND.name,
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: BRAND.ogImage,
        width: 1200,
        height: 630,
        alt: 'Comunora - Comunicação inteligente. Resultados reais.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [BRAND.ogImage],
  },
  icons: {
    icon: [
      { url: BRAND.favicon, sizes: '32x32', type: 'image/png' },
      { url: '/brand/comunora/comunora-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/brand/comunora/comunora-apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0B132B',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: BRAND.siteUrl,
    description: BRAND.shortDescription,
    publisher: {
      '@type': 'Organization',
      name: BRAND.name,
      url: BRAND.siteUrl,
    },
  };

  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
