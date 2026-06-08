import { BadRequestException, Injectable } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import Stripe from 'stripe';

const ACTIVE_STATUSES = new Set(['ativa', 'active', 'trialing', 'CONFIRMED', 'RECEIVED']);

@Injectable()
export class BillingService {
  private stripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new BadRequestException('stripe nao configurado');
    return new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  }

  isActiveStatus(status: string | null | undefined): boolean {
    return Boolean(status && ACTIVE_STATUSES.has(status));
  }

  status(tenantId: string) {
    return comTenant(tenantId, async (q) => {
      const plano = (await q(`select valor_centavos, ciclo from planos order by valor_centavos limit 1`)).rows[0];
      const ass = (await q(
        `select status, qtd_projetos, provider, provider_customer_id, provider_subscription_id, provider_price_id, atualizado_em
         from assinaturas
         where tenant_id=$1
         order by criado_em desc
         limit 1`,
        [tenantId],
      )).rows[0] ?? null;
      const ativos = (await q(`select count(*)::int as n from projetos where status='ativo'`)).rows[0].n;
      return {
        assinatura: ass,
        pagamento_obrigatorio: process.env.BILLING_REQUIRED !== 'false',
        pago: this.isActiveStatus(ass?.status),
        projetos_ativos: ativos,
        valor_por_projeto_centavos: plano?.valor_centavos ?? null,
      };
    });
  }

  async criarCheckout(tenantId: string, userId: string, origem?: string): Promise<{ url: string; sessionId: string }> {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new BadRequestException('STRIPE_PRICE_ID nao configurado');

    const appUrl = this.appUrl(origem);
    return comTenant(tenantId, async (q) => {
      const user = (await q(`select email, nome from usuarios where id=$1`, [userId])).rows[0];
      if (!user?.email) throw new BadRequestException('usuario sem email');

      const qtd = Math.max((await q(`select count(*)::int as n from projetos where status='ativo'`)).rows[0].n, 1);
      const stripe = this.stripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: user.email,
        client_reference_id: tenantId,
        line_items: [{ price: priceId, quantity: qtd }],
        success_url: `${appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/billing?checkout=cancel`,
        metadata: { tenantId, userId },
        subscription_data: { metadata: { tenantId, userId } },
      });

      await q(
        `insert into assinaturas
          (tenant_id, provider, provider_checkout_session_id, provider_customer_id, provider_price_id, status, qtd_projetos)
         values ($1,'stripe',$2,$3,$4,'pendente',$5)
         on conflict (provider_checkout_session_id) do update
           set atualizado_em=now()
         returning id`,
        [tenantId, session.id, typeof session.customer === 'string' ? session.customer : null, priceId, qtd],
      );

      if (!session.url) throw new BadRequestException('stripe nao retornou url do checkout');
      return { url: session.url, sessionId: session.id };
    });
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

export { ACTIVE_STATUSES };
