import type { MetadataRoute } from 'next';
import { BRAND } from '../lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.shortDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F4F7',
    theme_color: '#0B132B',
    icons: [
      {
        src: '/brand/comunora/comunora-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/brand/comunora/comunora-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/brand/comunora/comunora-favicon.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  };
}
