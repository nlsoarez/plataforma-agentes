import { BadRequestException, Body, Controller, Headers, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { comTenant, resolverAssinatura, definirStatusTenant } from '@plataforma/db';
import Stripe from 'stripe';

@Controller('webhook')
export class BillingWebhookController {
  @Post('billing')
  async receber(@Body() body: any, @Res() res: any) {
    const evento: string = body?.event ?? '';
    const subId: string | undefined = body?.payment?.subscription;
    if (!subId) return res.sendStatus(HttpStatus.OK);

    const ass = await resolverAssinatura(subId);
    if (!ass) return res.sendStatus(HttpStatus.OK);

    let statusAss: string | null = null, statusTenant: string | null = null;
    if (evento === 'PAYMENT_CONFIRMED' || evento === 'PAYMENT_RECEIVED') { statusAss = 'ativa'; statusTenant = 'active'; }
    else if (evento === 'PAYMENT_OVERDUE') { statusAss = 'inadimplente'; statusTenant = 'suspended'; }
    else if (evento === 'SUBSCRIPTION_DELETED' || evento === 'PAYMENT_DELETED') { statusAss = 'cancelada'; statusTenant = 'suspended'; }

    if (statusAss) {
      await comTenant(ass.tenant_id, (q) => q(`update assinaturas set status=$1, atualizado_em=now() where id=$2`, [statusAss, ass.id]));
      if (statusTenant) await definirStatusTenant(ass.tenant_id, statusTenant);
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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const tenantId = session.metadata?.tenantId || session.client_reference_id;
      if (!tenantId) return res.sendStatus(HttpStatus.OK);

      await comTenant(tenantId, async (q) => {
        await q(
          `update assinaturas
              set provider_customer_id=$2,
                  provider_subscription_id=$3,
                  status='ativa',
                  atualizado_em=now()
            where provider_checkout_session_id=$1`,
          [
            session.id,
            typeof session.customer === 'string' ? session.customer : null,
            typeof session.subscription === 'string' ? session.subscription : null,
          ],
        );
      });
      await definirStatusTenant(tenantId, 'active');
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const subId = subscription.id;
      const ass = await resolverAssinatura(subId);
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
