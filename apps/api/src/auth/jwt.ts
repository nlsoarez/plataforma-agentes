import jwt from 'jsonwebtoken';
import type { Sessao } from '@plataforma/shared';

const SEGREDO = () => process.env.JWT_SECRET || 'troque-isto-em-producao';

export function assinarToken(s: Sessao): string {
  return jwt.sign(s, SEGREDO(), { expiresIn: '12h' });
}

export function verificarToken(token: string): Sessao {
  return jwt.verify(token, SEGREDO()) as Sessao;
}

export interface EstadoGoogleOAuth {
  typ: 'google_oauth';
  dominio: string;
  origem: string;
  codeVerifier: string;
}

export function assinarEstadoGoogleOAuth(estado: EstadoGoogleOAuth): string {
  return jwt.sign(estado, SEGREDO(), { expiresIn: '10m' });
}

export function verificarEstadoGoogleOAuth(token: string): EstadoGoogleOAuth {
  const estado = jwt.verify(token, SEGREDO()) as EstadoGoogleOAuth;
  if (estado.typ !== 'google_oauth' || !estado.dominio || !estado.origem || !estado.codeVerifier) {
    throw new Error('estado oauth invalido');
  }
  return estado;
}
