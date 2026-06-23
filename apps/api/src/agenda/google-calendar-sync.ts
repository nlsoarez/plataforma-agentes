import type { QueryFn } from '@plataforma/db';
import { decryptSecret, encryptSecret } from '../secrets/crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_DURATION_MINUTES = 60;

type CalendarInput = {
  summary: string;
  description?: string | null;
  startsAt: Date;
  durationMinutes?: number | null;
  providerRef?: string | null;
};

type CalendarSyncResult =
  | { status: 'sincronizado'; providerRef: string; metadata: unknown }
  | { status: 'pendente'; reason: string }
  | { status: 'falha'; error: string };

export async function verificarDisponibilidadeGoogleCalendarTenant(
  q: QueryFn,
  tenantId: string,
  startsAt: Date,
  durationMinutes?: number | null,
): Promise<null | { available: boolean; busy: Array<{ start: string; end: string }> }> {
  const integration = await buscarIntegracao(q, tenantId);
  if (!integration) return null;
  const token = await accessTokenForIntegration(q, integration);
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
  const duration = Number(durationMinutes || DEFAULT_DURATION_MINUTES);
  const endsAt = new Date(startsAt.getTime() + Math.max(15, duration) * 60_000);
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: startsAt.toISOString(),
      timeMax: endsAt.toISOString(),
      timeZone: timezone,
      items: [{ id: integration.calendar_id || 'primary' }],
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Google Calendar freebusy ${response.status}: ${bodyText.slice(0, 500)}`);
  const body = JSON.parse(bodyText) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const busy = body.calendars?.[integration.calendar_id || 'primary']?.busy || [];
  return { available: busy.length === 0, busy };
}

export async function sincronizarAgendamentoGoogleCalendar(
  q: QueryFn,
  tenantId: string,
  agendamentoId: string,
  input: CalendarInput,
): Promise<CalendarSyncResult> {
  const integration = await buscarIntegracao(q, tenantId);
  if (!integration) {
    const reason = 'Google Calendar nao conectado em Integracoes.';
    await marcarPendente(q, agendamentoId, reason);
    return { status: 'pendente', reason };
  }

  try {
    const token = await accessTokenForIntegration(q, integration);
    const event = input.providerRef
      ? await atualizarEventoComToken(token, integration.calendar_id || 'primary', input.providerRef, input)
      : await criarEventoComToken(token, integration.calendar_id || 'primary', input);

    await q(
      `update agendamentos
          set status='sincronizado',
              provider='google_calendar_oauth',
              provider_ref=$2,
              erro=null,
              metadata=coalesce(metadata, '{}'::jsonb) || $3::jsonb,
              atualizado_em=now()
        where id=$1`,
      [agendamentoId, event.id, JSON.stringify({ googleCalendar: event })],
    );
    await q(
      `update calendar_integrations
          set last_sync_at=now(), last_error=null, atualizado_em=now()
        where id=$1`,
      [integration.id],
    );
    return { status: 'sincronizado', providerRef: event.id, metadata: event };
  } catch (e: any) {
    const error = e?.message || 'erro desconhecido ao sincronizar Google Calendar';
    await q(
      `update agendamentos
          set status='falha',
              provider='google_calendar_oauth',
              erro=$2,
              atualizado_em=now()
        where id=$1`,
      [agendamentoId, error],
    );
    await q(
      `update calendar_integrations
          set last_error=$2, atualizado_em=now()
        where id=$1`,
      [integration.id, error],
    );
    return { status: 'falha', error };
  }
}

export async function excluirEventoGoogleCalendar(
  q: QueryFn,
  tenantId: string,
  providerRef?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!providerRef) return { ok: true };
  const integration = await buscarIntegracao(q, tenantId);
  if (!integration) return { ok: false, error: 'Google Calendar nao conectado em Integracoes.' };

  try {
    const token = await accessTokenForIntegration(q, integration);
    const calendarId = encodeURIComponent(integration.calendar_id || 'primary');
    const eventId = encodeURIComponent(providerRef);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404 || response.status === 410) return { ok: true };
    const bodyText = await response.text();
    if (!response.ok) return { ok: false, error: `Google Calendar ${response.status}: ${bodyText.slice(0, 500)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'falha ao excluir evento no Google Calendar' };
  }
}

async function buscarIntegracao(q: QueryFn, tenantId: string) {
  return (await q(
    `select id, calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at
       from calendar_integrations
      where tenant_id=$1 and provider='google' and ativo=true
      order by atualizado_em desc
      limit 1`,
    [tenantId],
  )).rows[0];
}

async function marcarPendente(q: QueryFn, agendamentoId: string, reason: string) {
  await q(
    `update agendamentos
        set status='pendente',
            provider='manual',
            erro=$2,
            atualizado_em=now()
      where id=$1`,
    [agendamentoId, reason],
  );
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
    throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET nao configurados na API');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
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

async function criarEventoComToken(accessToken: string, calendarIdRaw: string, input: CalendarInput) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarIdRaw || 'primary')}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload(input)),
  });
  return parseCalendarResponse(response, 'Google Calendar');
}

async function atualizarEventoComToken(accessToken: string, calendarIdRaw: string, eventIdRaw: string, input: CalendarInput) {
  const calendarId = encodeURIComponent(calendarIdRaw || 'primary');
  const eventId = encodeURIComponent(eventIdRaw);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload(input)),
  });
  return parseCalendarResponse(response, 'Google Calendar');
}

function eventPayload(input: CalendarInput) {
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'America/Sao_Paulo';
  const duration = Number(input.durationMinutes || DEFAULT_DURATION_MINUTES);
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + Math.max(15, duration) * 60_000);
  return {
    summary: input.summary,
    description: input.description || undefined,
    start: { dateTime: startsAt.toISOString(), timeZone: timezone },
    end: { dateTime: endsAt.toISOString(), timeZone: timezone },
  };
}

async function parseCalendarResponse(response: Response, label: string) {
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`${label} ${response.status}: ${bodyText.slice(0, 500)}`);
  const body = JSON.parse(bodyText) as { id: string; htmlLink?: string; status?: string };
  return {
    id: body.id,
    htmlLink: body.htmlLink || null,
    status: body.status || null,
  };
}
