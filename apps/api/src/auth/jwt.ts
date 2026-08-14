import jwt from 'jsonwebtoken';
import type { Sessao } from '@plataforma/shared';
import { requireSecret } from '@plataforma/shared';

const SEGREDO = () => requireSecret('JWT_SECRET', process.env, 'dev-only-jwt-secret');
const JWT_OPTIONS = { issuer: 'comunora-api', audience: 'comunora-web' } as const;

export function assinarToken(s: Sessao): string {
  return jwt.sign(s, SEGREDO(), { algorithm: 'HS256', expiresIn: '12h', ...JWT_OPTIONS });
}

export function verificarToken(token: string): Sessao {
  return jwt.verify(token, SEGREDO(), { algorithms: ['HS256'], ...JWT_OPTIONS }) as Sessao;
}

export interface EstadoGoogleOAuth {
  typ: 'google_oauth';
  dominio: string;
  origem: string;
  codeVerifier: string;
}

export interface EstadoGoogleCalendarOAuth {
  typ: 'google_calendar_oauth';
  tenantId: string;
  userId: string;
  origem: string;
  codeVerifier: string;
}

export function assinarEstadoGoogleOAuth(estado: EstadoGoogleOAuth): string {
  return jwt.sign(estado, SEGREDO(), { algorithm: 'HS256', expiresIn: '10m', ...JWT_OPTIONS });
}

export function verificarEstadoGoogleOAuth(token: string): EstadoGoogleOAuth {
  const estado = jwt.verify(token, SEGREDO(), { algorithms: ['HS256'], ...JWT_OPTIONS }) as EstadoGoogleOAuth;
  if (estado.typ !== 'google_oauth' || !estado.dominio || !estado.origem || !estado.codeVerifier) {
    throw new Error('estado oauth invalido');
  }
  return estado;
}

export function assinarEstadoGoogleCalendarOAuth(estado: EstadoGoogleCalendarOAuth): string {
  return jwt.sign(estado, SEGREDO(), { algorithm: 'HS256', expiresIn: '10m', ...JWT_OPTIONS });
}

export function verificarEstadoGoogleCalendarOAuth(token: string): EstadoGoogleCalendarOAuth {
  const estado = jwt.verify(token, SEGREDO(), { algorithms: ['HS256'], ...JWT_OPTIONS }) as EstadoGoogleCalendarOAuth;
  if (estado.typ !== 'google_calendar_oauth' || !estado.tenantId || !estado.userId || !estado.origem || !estado.codeVerifier) {
    throw new Error('estado oauth calendar invalido');
  }
  return estado;
}
