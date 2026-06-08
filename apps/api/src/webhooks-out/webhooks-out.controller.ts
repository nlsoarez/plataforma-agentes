import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { createHmac } from 'crypto';
import { AuthGuard } from '../auth/auth.guard';
import { assertLimit } from '../billing/entitlements';

const EVENTOS_PADRAO = ['LEAD_CREATED', 'LEAD_INTERACTION', 'AI_RESPONSE', 'LEAD_KANBAN_UPDATED', 'LEAD_TAG_ADDED', 'LEAD_TAG_REMOVED', 'ERROR'];

function assinarWebhook(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

@Controller('integracoes/webhooks')
@UseGuards(AuthGuard)
export class WebhooksOutController {
  @Get()
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

  @Post()
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

  @Post(':id/testar')
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

  @Delete(':id')
  desativar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await q(`update webhook_subscriptions set ativo=false where id=$1`, [id]);
      return { ok: true };
    });
  }
}
