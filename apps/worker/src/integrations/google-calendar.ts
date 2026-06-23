import { createSign } from 'crypto';
import type { QueryFn } from '@plataforma/db';
import { decryptSecret, encryptSecret } from '../secrets';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ');
const DEFAULT_DURATION_MINUTES = 60;

let cachedToken: { token: string; expiresAt: number } | null = null;

function serviceAccountEmail() {
  return process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
}

function privateKey() {
  return (process.env.GOOGLE_CALENDAR_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n')
    .trim();
}

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_ID && serviceAccountEmail() && privateKey());
}

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function getAccessToken() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > nowSeconds + 60) return cachedToken.token;

  const email = serviceAccountEmail();
  const key = privateKey();
  if (!email || !key) throw new Error('Google Calendar service account nao configurada');

  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64urlJson({
    iss: email,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${bodyText.slice(0, 500)}`);

  const body = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google OAuth nao retornou access_token');
  cachedToken = {
    token: body.access_token,
    expiresAt: nowSeconds + (body.expires_in || 3600),
  };
  return cachedToken.token;
}

export async function criarEventoGoogleCalendar(input: {
  summary: string;
  description?: string | null;
  startsAt: Date;
  durationMinutes?: number;
}) {
  if (!googleCalendarConfigured()) throw new Error('Google Calendar nao configurado');

  const token = await getAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || '');
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
  const duration = Number(process.env.GOOGLE_CALENDAR_EVENT_DURATION_MINUTES || input.durationMinutes || DEFAULT_DURATION_MINUTES);
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + Math.max(15, duration) * 60_000);

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description || undefined,
      start: { dateTime: startsAt.toISOString(), timeZone: timezone },
      end: { dateTime: endsAt.toISOString(), timeZone: timezone },
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google Calendar ${response.status}: ${bodyText.slice(0, 500)}`);

  const body = JSON.parse(bodyText) as { id: string; htmlLink?: string; status?: string };
  return {
    id: body.id,
    htmlLink: body.htmlLink || null,
    status: body.status || null,
  };
}

export async function verificarDisponibilidadeGoogleCalendar(input: {
  startsAt: Date;
  durationMinutes?: number;
}) {
  if (!googleCalendarConfigured()) return null;

  const token = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
  const duration = Number(process.env.GOOGLE_CALENDAR_EVENT_DURATION_MINUTES || input.durationMinutes || DEFAULT_DURATION_MINUTES);
  return freeBusyComToken(token, calendarId, input.startsAt, duration, timezone);
}

export async function criarEventoGoogleCalendarTenant(q: QueryFn, tenantId: string, input: {
  summary: string;
  description?: string | null;
  startsAt: Date;
  durationMinutes?: number;
}) {
  const integration = (await q(
    `select id, calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at
       from calendar_integrations
      where tenant_id=$1 and provider='google' and ativo=true
      order by atualizado_em desc
      limit 1`,
    [tenantId],
  )).rows[0];
  if (!integration) return null;

  try {
    const token = await accessTokenForIntegration(q, integration);
    const event = await criarEventoComToken(token, integration.calendar_id || 'primary', input);
    await q(
      `update calendar_integrations
          set last_sync_at=now(), last_error=null, atualizado_em=now()
        where id=$1`,
      [integration.id],
    );
    return event;
  } catch (e: any) {
    await q(
      `update calendar_integrations
          set last_error=$2, atualizado_em=now()
        where id=$1`,
      [integration.id, e?.message || 'erro desconhecido'],
    );
    throw e;
  }
}

export async function verificarDisponibilidadeGoogleCalendarTenant(q: QueryFn, tenantId: string, input: {
  startsAt: Date;
  durationMinutes?: number;
}) {
  const integration = (await q(
    `select id, calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at
       from calendar_integrations
      where tenant_id=$1 and provider='google' and ativo=true
      order by atualizado_em desc
      limit 1`,
    [tenantId],
  )).rows[0];
  if (!integration) return null;

  try {
    const token = await accessTokenForIntegration(q, integration);
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
    const duration = Number(process.env.GOOGLE_CALENDAR_EVENT_DURATION_MINUTES || input.durationMinutes || DEFAULT_DURATION_MINUTES);
    const availability = await freeBusyComToken(token, integration.calendar_id || 'primary', input.startsAt, duration, timezone);
    await q(
      `update calendar_integrations
          set last_sync_at=now(), last_error=null, atualizado_em=now()
        where id=$1`,
      [integration.id],
    );
    return availability;
  } catch (e: any) {
    await q(
      `update calendar_integrations
          set last_error=$2, atualizado_em=now()
        where id=$1`,
      [integration.id, e?.message || 'erro desconhecido'],
    );
    throw e;
  }
}

async function accessTokenForIntegration(q: QueryFn, integration: any) {
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
  if (integration.encrypted_access_token && expiresAt > Date.now() + 60_000) {
    const token = decryptSecret(integration.encrypted_access_token);
    if (token) return token;
  }

  const refreshToken = decryptSecret(integration.encrypted_refresh_token);
  if (!refreshToken) throw new Error('refresh_token do Google Calendar ausente');
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET nao configurados no worker');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google refresh ${response.status}: ${bodyText.slice(0, 500)}`);
  const body = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google refresh nao retornou access_token');

  await q(
    `update calendar_integrations
        set encrypted_access_token=$2,
            token_expires_at=$3,
            atualizado_em=now()
      where id=$1`,
    [
      integration.id,
      encryptSecret(body.access_token),
      new Date(Date.now() + (body.expires_in || 3600) * 1000).toISOString(),
    ],
  );
  return body.access_token;
}

async function criarEventoComToken(accessToken: string, calendarIdRaw: string, input: {
  summary: string;
  description?: string | null;
  startsAt: Date;
  durationMinutes?: number;
}) {
  const calendarId = encodeURIComponent(calendarIdRaw || 'primary');
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
  const duration = Number(process.env.GOOGLE_CALENDAR_EVENT_DURATION_MINUTES || input.durationMinutes || DEFAULT_DURATION_MINUTES);
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + Math.max(15, duration) * 60_000);

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description || undefined,
      start: { dateTime: startsAt.toISOString(), timeZone: timezone },
      end: { dateTime: endsAt.toISOString(), timeZone: timezone },
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google Calendar ${response.status}: ${bodyText.slice(0, 500)}`);

  const body = JSON.parse(bodyText) as { id: string; htmlLink?: string; status?: string };
  return {
    id: body.id,
    htmlLink: body.htmlLink || null,
    status: body.status || null,
  };
}

async function freeBusyComToken(
  accessToken: string,
  calendarIdRaw: string,
  startsAt: Date,
  durationMinutes: number,
  timezone: string,
) {
  const endsAt = new Date(startsAt.getTime() + Math.max(15, durationMinutes) * 60_000);
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: startsAt.toISOString(),
      timeMax: endsAt.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarIdRaw || 'primary' }],
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google Calendar freebusy ${response.status}: ${bodyText.slice(0, 500)}`);

  const body = JSON.parse(bodyText) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }>;
  };
  const calendar = body.calendars?.[calendarIdRaw || 'primary'];
  const busy = calendar?.busy || [];
  return {
    available: busy.length === 0,
    busy,
  };
}
