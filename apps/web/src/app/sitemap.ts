import type { MetadataRoute } from 'next';
import { BRAND } from '../lib/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicRoutes = [
    { path: '', priority: 1 },
    { path: '/quem-somos', priority: 0.8 },
    { path: '/faq', priority: 0.7 },
    { path: '/politica-de-privacidade', priority: 0.5 },
    { path: '/termos-de-uso', priority: 0.5 },
  ];

  return [
    ...publicRoutes.map((route) => ({
      url: `${BRAND.siteUrl}${route.path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: route.priority,
    })),
    {
      url: BRAND.appUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
