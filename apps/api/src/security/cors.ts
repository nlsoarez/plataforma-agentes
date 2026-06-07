const DEV_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

export function parseAllowedOrigins(value = ''): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function allowedCorsOrigins(env = process.env): string[] {
  const configured = parseAllowedOrigins(env.CORS_ORIGINS ?? '');
  if (configured.length) return configured;
  if (env.NODE_ENV !== 'production') return DEV_ORIGINS;
  return [];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(origin.replace(/\/+$/, ''));
}
