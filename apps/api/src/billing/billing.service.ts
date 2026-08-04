import { BadRequestException, Injectable } from '@nestjs/common';
import { comTenant, definirStatusTenant } from '@plataforma/db';
import { AsaasBillingType, AsaasProvider } from './providers/asaas.provider';
import {
  getSubscriptionAccess,
  listPlansWithEntitlements,
  usageForFeature,
} from './entitlements';

const VALID_BILLING_TYPES = new Set(['BOLETO', 'PIX', 'CREDIT_CARD', 'UNDEFINED']);

export interface SubscribeInput {
  planCode?: string;
  billingCycle?: 'monthly' | 'annual';
  billingType?: AsaasBillingType;
  cpfCnpj?: string;
  name?: string;
  phone?: string;
  origem?: string;
}

@Injectable()
export class BillingService {
  constructor(private readonly asaas: AsaasProvider) {}

  async status(tenantId: string) {
    const access = await getSubscriptionAccess(tenantId);
    const plans = await listPlansWithEntitlements();
    const usage = await this.usageSnapshot(tenantId);
    const timeline = await this.billingTimeline(tenantId);

    return {
      provider: 'asaas',
      pagamento_obrigatorio: process.env.BILLING_REQUIRED !== 'false',
      pago: access.canUsePaidFeatures,
      acesso: access,
      assinatura: access.subscription,
      plano: access.plan,
      planos: plans,
      uso: usage,
      invoices: timeline.invoices,
      eventos: timeline.events,
      asaas_configurado: Boolean(process.env.ASAAS_API_KEY),
    };
  }

  async sincronizar(tenantId: string) {
    if (!process.env.ASAAS_API_KEY) throw new BadRequestException('ASAAS_API_KEY nao configurada');

    const result = await comTenant(tenantId, async (q) => {
      const ass = (await q(
        `select *
           from assinaturas
          where tenant_id=$1
            and provider='asaas'
            and external_subscription_id is not null
          order by criado_em desc
          limit 1`,
        [tenantId],
      )).rows[0];
      if (!ass?.external_subscription_id) {
        return { ok: false, message: 'Nenhuma assinatura Asaas encontrada para sincronizar.' };
      }

      const [subscription, payments] = await Promise.all([
        this.asaas.getSubscription(ass.external_subscription_id).catch(() => null),
        this.asaas.listSubscriptionPayments(ass.external_subscription_id),
      ]);

      for (const payment of payments) {
        await this.upsertInvoice(q, tenantId, ass.id, payment, null);
      }

      const mapped = this.statusFromPayments(payments);
      await q(
        `update assinaturas
            set status=$2,
                provider_customer_id=coalesce($3, provider_customer_id),
                external_customer_id=coalesce($3, external_customer_id),
                external_payment_id=coalesce($4, external_payment_id),
                current_period_started_at=coalesce(current_period_started_at, now()),
                current_period_ends_at=coalesce($5::timestamptz, current_period_ends_at),
                grace_period_ends_at=$6::timestamptz,
                metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('lastSyncAt', now(), 'asaasStatus', $7::text),
                atualizado_em=now()
          where id=$1`,
        [
          ass.id,
          mapped.status,
          subscription?.customer ?? null,
          mapped.paymentId,
          mapped.currentPeriodEndsAt,
          mapped.graceEndsAt,
          subscription?.status ?? null,
        ],
      );

      return { ok: true, status: mapped.status, pagamentos: payments.length };
    });
    if (result.ok && result.status === 'ativa') await definirStatusTenant(tenantId, 'active');
    return result;
  }

  async cancelar(tenantId: string) {
    if (!process.env.ASAAS_API_KEY) throw new BadRequestException('ASAAS_API_KEY nao configurada');

    const result = await comTenant(tenantId, async (q) => {
      const ass = (await q(
        `select *
           from assinaturas
          where tenant_id=$1
            and provider='asaas'
            and external_subscription_id is not null
          order by criado_em desc
          limit 1`,
        [tenantId],
      )).rows[0];
      if (!ass?.external_subscription_id) {
        throw new BadRequestException('Nenhuma assinatura Asaas ativa encontrada');
      }

      await this.asaas.deleteSubscription(ass.external_subscription_id);
      await q(
        `update assinaturas
            set status='cancelada',
                cancel_at_period_end=false,
                canceled_at=now(),
                atualizado_em=now()
          where id=$1`,
        [ass.id],
      );
      return { ok: true };
    });
    await definirStatusTenant(tenantId, 'suspended');
    return result;
  }

  async criarCheckout(tenantId: string, userId: string, input: SubscribeInput): Promise<{
    provider: 'asaas';
    subscriptionId: string;
    paymentId: string | null;
    url: string | null;
    pixQrCode?: string | null;
  }> {
    if (!process.env.ASAAS_API_KEY) throw new BadRequestException('ASAAS_API_KEY nao configurada');

    const planCode = input.planCode || 'pro';
    const billingCycle = input.billingCycle === 'annual' ? 'annual' : 'monthly';
    const billingType = this.billingType(input.billingType);
    const cpfCnpj = onlyDigits(input.cpfCnpj || '');
    if (!cpfCnpj || cpfCnpj.length < 11) throw new BadRequestException('CPF/CNPJ obrigatorio para assinatura Asaas');

    return comTenant(tenantId, async (q) => {
      const user = (await q(`select email, nome from usuarios where id=$1`, [userId])).rows[0];
      if (!user?.email) throw new BadRequestException('usuario sem email');

      const plan = (await q(
        `select id, code, nome, monthly_price_cents, annual_price_cents
           from planos
          where code=$1 and is_active=true
          limit 1`,
        [planCode],
      )).rows[0];
      if (!plan) throw new BadRequestException('plano invalido');

      const current = (await q(
        `select *
           from assinaturas
          where tenant_id=$1
          order by criado_em desc
          limit 1`,
        [tenantId],
      )).rows[0] ?? null;

      const amountCents = billingCycle === 'annual' ? plan.annual_price_cents : plan.monthly_price_cents;
      const customer = await this.asaas.createCustomer({
        name: input.name?.trim() || user.nome || user.email,
        email: user.email,
        cpfCnpj,
        phone: onlyDigits(input.phone || '') || undefined,
        externalReference: tenantId,
      });

      const nextDueDate = this.nextDueDate(current);
      const subscription = await this.asaas.createSubscription({
        customerId: customer.id,
        billingType,
        value: amountCents / 100,
        cycle: billingCycle === 'annual' ? 'YEARLY' : 'MONTHLY',
        nextDueDate,
        description: `Comunora ${plan.nome} - ${billingCycle === 'annual' ? 'Anual' : 'Mensal'}`,
        externalReference: tenantId,
      });

      const payments = await this.asaas.listSubscriptionPayments(subscription.id);
      const firstPayment = payments[0] ?? null;
      const pix = billingType === 'PIX' && firstPayment?.id
        ? await this.asaas.getPixQrCode(firstPayment.id)
        : null;

      const status = this.keepTrialActive(current) ? 'trialing' : 'pendente';
      const row = await q(
        `insert into assinaturas
          (tenant_id, plano_id, provider, provider_customer_id, provider_subscription_id,
           external_customer_id, external_subscription_id, external_payment_id, provider_price_id,
           status, qtd_projetos, billing_cycle, trial_started_at, trial_ends_at,
           current_period_started_at, current_period_ends_at, metadata)
         values ($1,$2,'asaas',$3,$4,$3,$4,$5,$6,$7,
                 greatest((select count(*)::int from projetos where status='ativo'), 1),
                 $8, coalesce($9::timestamptz, now()), $10::timestamptz,
                 now(), $11::timestamptz,
                 jsonb_build_object('billingType',$12::text,'checkoutOrigin',$13::text))
         returning id`,
        [
          tenantId,
          plan.id,
          customer.id,
          subscription.id,
          firstPayment?.id ?? null,
          plan.code,
          status,
          billingCycle,
          current?.trial_started_at ?? null,
          current?.trial_ends_at ?? null,
          billingCycle === 'annual' ? addYearsIso(new Date(), 1) : addMonthsIso(new Date(), 1),
          billingType,
          this.appUrl(input.origem),
        ],
      );

      if (firstPayment) {
        await this.upsertInvoice(q, tenantId, row.rows[0].id, firstPayment, pix?.payload ?? pix?.encodedImage ?? null);
      }

      return {
        provider: 'asaas',
        subscriptionId: subscription.id,
        paymentId: firstPayment?.id ?? null,
        url: firstPayment?.invoiceUrl ?? firstPayment?.bankSlipUrl ?? null,
        pixQrCode: pix?.payload ?? pix?.encodedImage ?? null,
      };
    });
  }

  private async usageSnapshot(tenantId: string): Promise<Record<string, number>> {
    const keys = [
      'projects',
      'whatsapp_connections',
      'team_users',
      'ai_agents',
      'contacts',
      'knowledge_documents',
      'storage_bytes',
      'active_automations',
      'public_api_keys',
      'outbound_webhooks',
      'campaigns_monthly',
      'campaign_recipients_monthly',
    ];
    const entries = await Promise.all(keys.map(async (key) => [key, await usageForFeature(tenantId, key)] as const));
    return Object.fromEntries(entries);
  }

  private async billingTimeline(tenantId: string): Promise<{ invoices: any[]; events: any[] }> {
    return comTenant(tenantId, async (q) => {
      const [invoices, events] = await Promise.all([
        q(
          `select id, external_invoice_id, amount_cents, status, due_date, paid_at,
                  payment_method, invoice_url, boleto_url, pix_qr_code, created_at, updated_at
             from invoices
            where tenant_id=$1
            order by created_at desc
            limit 20`,
          [tenantId],
        ),
        q(
          `select event_type, processing_status, processing_error, processed_at, created_at
             from billing_events
            where tenant_id=$1
            order by created_at desc
            limit 20`,
          [tenantId],
        ),
      ]);
      return { invoices: invoices.rows, events: events.rows };
    });
  }

  private async upsertInvoice(
    q: any,
    tenantId: string,
    subscriptionId: string,
    payment: any,
    pixQrCode: string | null,
  ): Promise<void> {
    if (!payment?.id) return;
    await q(
      `insert into invoices
        (tenant_id, subscription_id, provider, external_invoice_id, amount_cents, status,
         due_date, paid_at, payment_method, invoice_url, boleto_url, pix_qr_code, payload)
       values ($1,$2,'asaas',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       on conflict (provider, external_invoice_id) do update set
         status=excluded.status,
         paid_at=coalesce(excluded.paid_at, invoices.paid_at),
         invoice_url=excluded.invoice_url,
         boleto_url=excluded.boleto_url,
         pix_qr_code=coalesce(excluded.pix_qr_code, invoices.pix_qr_code),
         payload=excluded.payload,
         updated_at=now()`,
      [
        tenantId,
        subscriptionId,
        payment.id,
        Math.round(Number(payment.value ?? 0) * 100),
        payment.status ?? 'PENDING',
        payment.dueDate ?? null,
        payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
        payment.billingType ?? null,
        payment.invoiceUrl ?? null,
        payment.bankSlipUrl ?? null,
        pixQrCode,
        JSON.stringify(payment),
      ],
    );
  }

  private statusFromPayments(payments: any[]): {
    status: string;
    paymentId: string | null;
    graceEndsAt: string | null;
    currentPeriodEndsAt: string | null;
  } {
    const normalized = payments.map((p) => ({ ...p, statusNorm: String(p.status || '').toUpperCase() }));
    const paid = normalized.find((p) => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.statusNorm));
    if (paid) {
      return {
        status: 'ativa',
        paymentId: paid.id ?? null,
        graceEndsAt: null,
        currentPeriodEndsAt: addMonthsIso(new Date(), 1),
      };
    }

    const overdue = normalized.find((p) => p.statusNorm === 'OVERDUE');
    if (overdue) {
      return {
        status: 'inadimplente',
        paymentId: overdue.id ?? null,
        graceEndsAt: addDaysIso(new Date(), 5),
        currentPeriodEndsAt: null,
      };
    }

    const pending = normalized[0];
    return {
      status: 'pendente',
      paymentId: pending?.id ?? null,
      graceEndsAt: null,
      currentPeriodEndsAt: null,
    };
  }

  private billingType(value: AsaasBillingType | undefined): AsaasBillingType {
    const normalized = String(value || 'PIX').toUpperCase();
    if (!VALID_BILLING_TYPES.has(normalized)) throw new BadRequestException('forma de pagamento invalida');
    return normalized as AsaasBillingType;
  }

  private nextDueDate(current: any | null): string {
    if (this.keepTrialActive(current) && current.trial_ends_at) {
      return yyyyMmDd(new Date(current.trial_ends_at));
    }
    return yyyyMmDd(new Date());
  }

  private keepTrialActive(current: any | null): boolean {
    return current?.status === 'trialing'
      && current?.trial_ends_at
      && new Date(current.trial_ends_at).getTime() > Date.now();
  }

  private appUrl(origem?: string): string {
    if (origem) {
      try {
        const url = new URL(origem);
        if (url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          return url.origin;
        }
      } catch {
        // fallback abaixo
      }
    }
    return (process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function yyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(date: Date, months: number): string {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

function addYearsIso(date: Date, years: number): string {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString();
}

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}
