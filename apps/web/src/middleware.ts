import { NextResponse, type NextRequest } from 'next/server';

// Cada agência tem seu domínio. Aqui descobrimos qual tenant é pela requisição
// e injetamos no header pra o resto da app carregar logo, cores e favicon certos.
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const res = NextResponse.next();
  res.headers.set('x-tenant-host', host);
  return res;
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
