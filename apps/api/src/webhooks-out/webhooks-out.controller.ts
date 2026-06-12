import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { createHmac } from 'crypto';
import { AuthGuard } from '../auth/auth.guard';
import { assertLimit } from '../billing/entitlements';
import {
  calendarRedirectUri,
  concluirGoogleCalendarOAuth,
  googleCalendarOAuthConfigured,
  iniciarGoogleCalendarOAuth,
} from './google-calendar-oauth';

const EVENTOS_PADRAO = ['LEAD_CREATED', 'LEAD_INTERACTION', 'AI_RESPONSE', 'LEAD_KANBAN_UPDATED', 'LEAD_TAG_ADDED', 'LEAD_TAG_REMOVED', 'ERROR'];

function assinarWebhook(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

@UseGuards(AuthGuard)
@Controller('integracoes')
export class WebhooksOutController {
  @Get('status')
  status(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const integration = (await q(
        `select account_email, calendar_id, token_expires_at, last_sync_at, last_error
           from calendar_integrations
          where provider='google' and ativo=true
          order by atualizado_em desc
          limit 1`,
      )).rows[0];

    const googleCalendar = Boolean(
      process.env.GOOGLE_CALENDAR_ID &&
      (process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
      (process.env.GOOGLE_CALENDAR_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    );
    return {
      googleCalendar: {
        configured: Boolean(integration) || googleCalendar,
        tenantConnected: Boolean(integration),
        accountEmail: integration?.account_email ? maskEmail(integration.account_email) : null,
        calendarId: integration?.calendar_id || (process.env.GOOGLE_CALENDAR_ID ? mask(process.env.GOOGLE_CALENDAR_ID) : null),
        mode: integration ? 'tenant_oauth' : (googleCalendar ? 'service_account' : null),
        lastSyncAt: integration?.last_sync_at || null,
        lastError: integration?.last_error || null,
        oauthConfigured: googleCalendarOAuthConfigured(),
        redirectUri: calendarRedirectUri(),
      },
      calendarWebhook: {
        configured: Boolean(process.env.CALENDAR_WEBHOOK_URL),
      },
    };
    });
  }

  @Get()
  root(@Req() req: any) {
    return this.status(req);
  }

  @Post('google-calendar/start')
  iniciarCalendar(@Req() req: any, @Body() body: { origem?: string }) {
    return iniciarGoogleCalendarOAuth({
      tenantId: req.user.tenantId,
      userId: req.user.sub,
      origem: body.origem,
    });
  }

  @Post('google-calendar/disconnect')
  desconectarCalendar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await q(`update calendar_integrations set ativo=false, atualizado_em=now() where provider='google' and ativo=true`);
      return { ok: true };
    });
  }

  @Get('webhooks')
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, nome, url, eventos, ativo, criado_em
         from webhook_subscriptions
         order by criado_em desc`,
      );
      return r.rows;
    });
  }

  @Post('webhooks')
  async criar(@Body() body: { nome?: string; url: string; secret?: string; eventos?: string[] }, @Req() req: any) {
    await assertLimit(req.user.tenantId, 'outbound_webhooks', 1);
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `insert into webhook_subscriptions (tenant_id, nome, url, secret, eventos)
         values ($1,$2,$3,$4,$5)
         returning id, nome, url, eventos, ativo, criado_em`,
        [req.user.tenantId, body.nome || 'Webhook', body.url, body.secret || null, body.eventos?.length ? body.eventos : EVENTOS_PADRAO],
      );
      return r.rows[0];
    });
  }

  @Post('webhooks/:id/testar')
  testar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select id, url, secret from webhook_subscriptions where id=$1 and ativo=true`, [id]);
      const sub = r.rows[0];
      if (!sub) return { ok: false, message: 'Webhook nao encontrado' };
      const payload = JSON.stringify({ type: 'PING', timestamp: new Date().toISOString() });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sub.secret) headers['x-attende-signature'] = assinarWebhook(sub.secret, payload);
      const res = await fetch(sub.url, { method: 'POST', headers, body: payload });
      return { ok: res.ok, status: res.status };
    });
  }

  @Delete('webhooks/:id')
  desativar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await q(`update webhook_subscriptions set ativo=false where id=$1`, [id]);
      return { ok: true };
    });
  }
}

@Controller('integracoes/google-calendar')
export class GoogleCalendarCallbackController {
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string | undefined, @Res() res: any) {
    try {
      if (error) throw new Error(error);
      const result = await concluirGoogleCalendarOAuth(code, state);
      return res.redirect(`${result.origem}/integracoes?calendar=connected`);
    } catch (e: any) {
      const fallback = (process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
      return res.redirect(`${fallback}/integracoes?calendar_error=${encodeURIComponent(e?.message || 'falha ao conectar calendar')}`);
    }
  }
}

function mask(value: string) {
  if (value.length <= 8) return 'configurado';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return mask(email);
  return `${name.slice(0, 2)}***@${domain}`;
}
