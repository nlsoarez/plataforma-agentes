import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { comTenant, resolverAssinatura, definirStatusTenant } from '@plataforma/db';

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
}
