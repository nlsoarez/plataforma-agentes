import { NextResponse, type NextRequest } from 'next/server';

const APP_ROUTES = [
  '/agenda',
  '/agentes',
  '/ai-settings',
  '/api-docs',
  '/automacoes',
  '/billing',
  '/campanhas',
  '/dashboard',
  '/equipe',
  '/inbox',
  '/integracoes',
  '/knowledge',
  '/leads',
  '/login',
  '/onboarding',
  '/pipeline',
  '/sessoes',
  '/settings',
  '/templates',
];

function normalizedHost(value: string) {
  return value.replace(/^www\./, '').split(':')[0].toLowerCase();
}

function isAppRoute(pathname: string) {
  return APP_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// Preserva o host para resolver tenant/white-label e evita que rotas internas
// sejam usadas pelo dominio institucional raiz.
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const siteHost = normalizedHost(
    process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : 'comunora.com.br',
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.comunora.com.br';

  const currentHost = normalizedHost(host);

  if (currentHost === siteHost && req.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/site', req.url));
  }

  if (currentHost === siteHost && isAppRoute(req.nextUrl.pathname)) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, appUrl);
    return NextResponse.redirect(url, 308);
  }

  const res = NextResponse.next();
  res.headers.set('x-tenant-host', host);
  return res;
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
