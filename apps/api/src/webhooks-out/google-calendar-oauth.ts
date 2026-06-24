import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { comTenant } from '@plataforma/db';
import { decryptSecret, encryptSecret } from '../secrets/crypto';
import { assinarEstadoGoogleCalendarOAuth, verificarEstadoGoogleCalendarOAuth } from '../auth/jwt';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
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

type CalendarIntegrationRow = {
  id: string;
  calendar_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
};

type GoogleCalendarListItem = {
  id?: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

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

export async function listarGoogleCalendarsTenant(tenantId: string) {
  return comTenant(tenantId, async (q) => {
    const integration = await buscarIntegracao(q);
    if (!integration) throw new BadRequestException('Google Calendar nao conectado');
    const accessToken = await accessTokenForIntegration(q, integration);
    const calendars = await buscarCalendarios(accessToken);
    await q(
      `update calendar_integrations
          set calendars_cache=$2::jsonb,
              calendars_cache_at=now(),
              last_error=null,
              atualizado_em=now()
        where id=$1`,
      [integration.id, JSON.stringify(calendars)],
    );
    return {
      ok: true,
      selectedCalendarId: integration.calendar_id || 'primary',
      calendars,
    };
  });
}

export async function atualizarGoogleCalendarSelecionado(tenantId: string, calendarId: string) {
  const selected = String(calendarId || '').trim();
  if (!selected) throw new BadRequestException('calendarId obrigatorio');

  return comTenant(tenantId, async (q) => {
    const integration = await buscarIntegracao(q);
    if (!integration) throw new BadRequestException('Google Calendar nao conectado');
    const accessToken = await accessTokenForIntegration(q, integration);
    const calendars = await buscarCalendarios(accessToken);
    const found = calendars.find((calendar) => calendar.id === selected);
    if (!found) throw new BadRequestException('Agenda nao encontrada na conta conectada');
    if (!['owner', 'writer'].includes(found.accessRole || '')) {
      throw new BadRequestException('Selecione uma agenda com permissao de escrita');
    }
    await q(
      `update calendar_integrations
          set calendar_id=$2,
              calendars_cache=$3::jsonb,
              calendars_cache_at=now(),
              last_error=null,
              atualizado_em=now()
        where id=$1`,
      [integration.id, selected, JSON.stringify(calendars)],
    );
    return { ok: true, calendarId: selected, calendarName: found.summary || selected, calendars };
  });
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

async function buscarIntegracao(q: any): Promise<CalendarIntegrationRow | null> {
  return (await q(
    `select id, calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at
       from calendar_integrations
      where provider='google' and ativo=true
      order by atualizado_em desc
      limit 1`,
  )).rows[0] || null;
}

async function accessTokenForIntegration(q: any, integration: CalendarIntegrationRow) {
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
  if (integration.encrypted_access_token && expiresAt > Date.now() + 60_000) {
    const token = decryptSecret(integration.encrypted_access_token);
    if (token) return token;
  }

  const refreshToken = decryptSecret(integration.encrypted_refresh_token || '');
  if (!refreshToken) throw new UnauthorizedException('refresh_token do Google Calendar ausente');
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new UnauthorizedException('GOOGLE_OAUTH_CLIENT_ID/SECRET nao configurados');
  }

  const resposta = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const bodyText = await resposta.text();
  if (!resposta.ok) throw new UnauthorizedException(`Google refresh ${resposta.status}: ${bodyText.slice(0, 500)}`);
  const token = JSON.parse(bodyText) as GoogleTokenResponse;
  if (!token.access_token) throw new UnauthorizedException('Google refresh nao retornou access_token');

  await q(
    `update calendar_integrations
        set encrypted_access_token=$2,
            token_expires_at=$3,
            atualizado_em=now()
      where id=$1`,
    [
      integration.id,
      encryptSecret(token.access_token),
      new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
    ],
  );
  return token.access_token;
}

async function buscarCalendarios(accessToken: string) {
  const resposta = await fetch(`${GOOGLE_CALENDAR_LIST_URL}?minAccessRole=writer`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await resposta.json() as { items?: GoogleCalendarListItem[]; error?: { message?: string } };
  if (!resposta.ok) throw new UnauthorizedException(payload.error?.message || 'falha ao listar agendas Google');
  return (payload.items || [])
    .filter((calendar) => calendar.id)
    .map((calendar) => ({
      id: calendar.id as string,
      summary: calendar.summary || (calendar.id as string),
      primary: Boolean(calendar.primary),
      accessRole: calendar.accessRole || null,
      backgroundColor: calendar.backgroundColor || null,
    }));
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
