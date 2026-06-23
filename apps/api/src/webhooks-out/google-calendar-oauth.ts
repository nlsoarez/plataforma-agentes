import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { comTenant } from '@plataforma/db';
import { encryptSecret } from '../secrets/crypto';
import { assinarEstadoGoogleCalendarOAuth, verificarEstadoGoogleCalendarOAuth } from '../auth/jwt';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CALENDAR_SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ');

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean | string;
}

export function calendarRedirectUri() {
  if (process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI) return process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI;
  const publicUrl = process.env.API_PUBLIC_URL || 'http://localhost:3000';
  return `${publicUrl.replace(/\/+$/, '')}/integracoes/google-calendar/callback`;
}

export function googleCalendarOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export async function iniciarGoogleCalendarOAuth(input: { tenantId: string; userId: string; origem?: string }) {
  if (!googleCalendarOAuthConfigured()) throw new UnauthorizedException('google oauth nao configurado');

  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  const origem = origemPermitida(input.origem);
  const state = assinarEstadoGoogleCalendarOAuth({
    typ: 'google_calendar_oauth',
    tenantId: input.tenantId,
    userId: input.userId,
    origem,
    codeVerifier,
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    redirect_uri: calendarRedirectUri(),
    response_type: 'code',
    scope: `openid email ${CALENDAR_SCOPE}`,
    state,
    access_type: 'offline',
    prompt: 'consent select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}` };
}

export async function concluirGoogleCalendarOAuth(code: string, state: string) {
  if (!code || !state) throw new BadRequestException('callback calendar invalido');
  const estado = verificarEstadoGoogleCalendarOAuth(state);
  const token = await trocarCodigo(code, estado.codeVerifier);
  if (!token.access_token) throw new UnauthorizedException('google nao retornou access_token');
  if (!token.refresh_token) {
    throw new UnauthorizedException('google nao retornou refresh_token; remova o acesso anterior do app na conta Google e tente conectar novamente');
  }

  const perfil = await buscarPerfil(token.access_token);
  const emailVerificado = perfil.email_verified === true || perfil.email_verified === 'true';
  if (!perfil.email || !emailVerificado) throw new UnauthorizedException('conta google sem email verificado');

  await comTenant(estado.tenantId, async (q) => {
    await q(`update calendar_integrations set ativo=false, atualizado_em=now() where provider='google' and ativo=true`);
    await q(
      `insert into calendar_integrations (
         tenant_id, usuario_id, provider, account_email, calendar_id,
         encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes, ativo, last_sync_at
       )
       values ($1,$2,'google',$3,'primary',$4,$5,$6,$7,true,now())`,
      [
        estado.tenantId,
        estado.userId,
        perfil.email,
        encryptSecret(token.access_token),
        encryptSecret(token.refresh_token),
        token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        parseScopes(token.scope),
      ],
    );
  });

  return { origem: estado.origem, email: perfil.email };
}

async function trocarCodigo(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
  const resposta = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirect_uri: calendarRedirectUri(),
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });
  const payload = await resposta.json() as GoogleTokenResponse;
  if (!resposta.ok) throw new UnauthorizedException(payload.error_description || payload.error || 'falha no oauth google calendar');
  return payload;
}

async function buscarPerfil(accessToken: string): Promise<GoogleUserInfo> {
  const resposta = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await resposta.json() as GoogleUserInfo;
  if (!resposta.ok) throw new UnauthorizedException('falha ao buscar perfil google');
  return payload;
}

function parseScopes(scope: string | undefined) {
  return (scope || '').split(/\s+/).filter(Boolean);
}

function origemPermitida(origem: string | undefined) {
  if (origem) {
    try {
      const url = new URL(origem);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // fallback abaixo
    }
  }
  return (process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

function base64Url(valor: Buffer): string {
  return valor.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
