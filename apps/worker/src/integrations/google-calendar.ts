import { createSign } from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
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
