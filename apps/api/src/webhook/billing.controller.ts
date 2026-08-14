import { BadRequestException, Body, Controller, Headers, HttpStatus, Post, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { comTenant, definirStatusTenant, resolverAssinatura, resolverAssinaturaProvider } from '@plataforma/db';
import Stripe from 'stripe';
import { sharedSecretMatches } from './webhook-auth';

@Controller('webhook')
export class BillingWebhookController {
  @Post('billing')
  async receberAsaas(
    @Body() body: any,
    @Headers('asaas-access-token') token: string | undefined,
    @Res() res: any,
  ) {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!configuredToken) {
      throw new ServiceUnavailableException('webhook Asaas nao configurado');
    }
    if (!sharedSecretMatches(token, configuredToken)) {
      throw new BadRequestException('webhook asaas invalido');
    }

    const eventType = String(body?.event || body?.type || '');
    const payment = body?.payment ?? {};
    const subscriptionId = payment?.subscription || body?.subscription?.id;
    const paymentId = payment?.id;
    const externalEventId = String(body?.id || `${eventType}:${paymentId || subscriptionId || Date.now()}`);

    let ass = subscriptionId ? await resolverAssinaturaProvider('asaas', subscriptionId) : null;
    ass ??= paymentId ? await resolverAssinaturaProvider('asaas', paymentId) : null;

    const tenantIdFromPayload = isUuid(payment?.externalReference) ? payment.externalReference : null;
    const tenantId = ass?.tenant_id ?? tenantIdFromPayload;
    if (!tenantId) {
      console.warn('[billing] webhook ignorado: assinatura nao encontrada', externalEventId, eventType);
      return res.sendStatus(HttpStatus.OK);
    }

    const inserted = await recordBillingEvent(
      tenantId,
      ass?.id ?? null,
      'asaas',
      externalEventId,
      eventType,
      body,
      'processing',
      null,
    );
    if (!inserted) return res.sendStatus(HttpStatus.OK);

    try {
      await comTenant(tenantId, async (q) => {
        const currentAss = ass ?? (await q(
          `select id, tenant_id from assinaturas
            where tenant_id=$1
            order by criado_em desc
            limit 1`,
          [tenantId],
        )).rows[0];
        if (!currentAss?.id) return;

        await upsertInvoice(q, tenantId, currentAss.id, payment);

        const mapping = mapAsaasEvent(eventType);
        if (mapping.status) {
          await q(
            `update assinaturas
                set status=$2,
                    external_payment_id=coalesce($3, external_payment_id),
                    provider_customer_id=coalesce($4, provider_customer_id),
                    external_customer_id=coalesce($4, external_customer_id),
                    current_period_started_at=coalesce(current_period_started_at, now()),
                    current_period_ends_at=coalesce($5::timestamptz, current_period_ends_at),
                    grace_period_ends_at=$6::timestamptz,
                    canceled_at=case when $2 in ('cancelada','canceled') then now() else canceled_at end,
                    atualizado_em=now()
              where id=$1`,
            [
              currentAss.id,
              mapping.status,
              paymentId ?? null,
              payment?.customer ?? null,
              mapping.currentPeriodEndsAt,
              mapping.graceEndsAt,
            ],
          );
        }

        if (mapping.tenantStatus) {
          await definirStatusTenant(tenantId, mapping.tenantStatus);
        }
      });

      await markBillingEvent(tenantId, externalEventId, 'processed', null);
    } catch (err: any) {
      await markBillingEvent(tenantId, externalEventId, 'failed', err?.message || 'erro ao processar webhook');
      throw err;
    }

    return res.sendStatus(HttpStatus.OK);
  }

  @Post('stripe')
  async receberStripe(@Req() req: any, @Headers('stripe-signature') signature: string | undefined, @Res() res: any) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) throw new BadRequestException('stripe webhook nao configurado');
    if (!signature) throw new BadRequestException('stripe signature ausente');

    const stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
    } catch (err: any) {
      throw new BadRequestException(`stripe webhook invalido: ${err.message}`);
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const ass = await resolverAssinatura(subscription.id);
      if (!ass) return res.sendStatus(HttpStatus.OK);
      const ativa = ['active', 'trialing'].includes(subscription.status);
      const statusAss = ativa ? 'ativa' : subscription.status === 'canceled' ? 'cancelada' : 'inadimplente';
      const statusTenant = ativa ? 'active' : 'suspended';
      await comTenant(ass.tenant_id, (q) => q(
        `update assinaturas set status=$1, atualizado_em=now() where id=$2`,
        [statusAss, ass.id],
      ));
      await definirStatusTenant(ass.tenant_id, statusTenant);
    }

    return res.sendStatus(HttpStatus.OK);
  }
}

async function recordBillingEvent(
  tenantId: string,
  subscriptionId: string | null,
  provider: string,
  externalEventId: string,
  eventType: string,
  payload: any,
  status: string,
  error: string | null,
): Promise<boolean> {
  return comTenant(tenantId, async (q) => {
    const r = await q(
      `insert into billing_events
      (tenant_id, subscription_id, provider, external_event_id, event_type, payload,
       processing_status, processing_error, processed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,case when $7='processed' or $7='ignored' then now() else null end)
     on conflict (provider, external_event_id) do nothing`,
      [tenantId, subscriptionId, provider, externalEventId, eventType, payload, status, error],
    );
    return r.rowCount > 0;
  });
}

async function markBillingEvent(tenantId: string, externalEventId: string, status: string, error: string | null): Promise<void> {
  await comTenant(tenantId, (q) => q(
    `update billing_events
        set processing_status=$2,
            processing_error=$3,
            processed_at=now()
      where provider='asaas' and external_event_id=$1`,
    [externalEventId, status, error],
  ));
}

async function upsertInvoice(q: any, tenantId: string, subscriptionId: string, payment: any): Promise<void> {
  if (!payment?.id) return;
  await q(
    `insert into invoices
      (tenant_id, subscription_id, provider, external_invoice_id, amount_cents, status,
       due_date, paid_at, payment_method, invoice_url, boleto_url, payload)
     values ($1,$2,'asaas',$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     on conflict (provider, external_invoice_id) do update set
       status=excluded.status,
       paid_at=coalesce(excluded.paid_at, invoices.paid_at),
       invoice_url=excluded.invoice_url,
       boleto_url=excluded.boleto_url,
       payload=excluded.payload,
       updated_at=now()`,
    [
      tenantId,
      subscriptionId,
      payment.id,
      Math.round(Number(payment.value ?? 0) * 100),
      payment.status ?? 'UNKNOWN',
      payment.dueDate ?? null,
      payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
      payment.billingType ?? null,
      payment.invoiceUrl ?? null,
      payment.bankSlipUrl ?? null,
      JSON.stringify(payment),
    ],
  );
}

function mapAsaasEvent(eventType: string): {
  status: string | null;
  tenantStatus: string | null;
  graceEndsAt: string | null;
  currentPeriodEndsAt: string | null;
} {
  if (eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_RECEIVED') {
    return {
      status: 'ativa',
      tenantStatus: 'active',
      graceEndsAt: null,
      currentPeriodEndsAt: addMonthsIso(new Date(), 1),
    };
  }
  if (eventType === 'PAYMENT_OVERDUE') {
    return {
      status: 'inadimplente',
      tenantStatus: 'active',
      graceEndsAt: addDaysIso(new Date(), 5),
      currentPeriodEndsAt: null,
    };
  }
  if (eventType === 'SUBSCRIPTION_DELETED' || eventType === 'PAYMENT_DELETED') {
    return {
      status: 'cancelada',
      tenantStatus: 'suspended',
      graceEndsAt: null,
      currentPeriodEndsAt: null,
    };
  }
  return { status: null, tenantStatus: null, graceEndsAt: null, currentPeriodEndsAt: null };
}

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function addMonthsIso(date: Date, months: number): string {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
