import jwt from 'jsonwebtoken';
import type { Sessao } from '@plataforma/shared';

const SEGREDO = () => process.env.JWT_SECRET || 'troque-isto-em-producao';

export function assinarToken(s: Sessao): string {
  return jwt.sign(s, SEGREDO(), { expiresIn: '12h' });
}

export function verificarToken(token: string): Sessao {
  return jwt.verify(token, SEGREDO()) as Sessao;
}
