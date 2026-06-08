import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { verificarToken } from './jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const h: string | undefined = req.headers['authorization'];
    // SSE (EventSource) não envia header Authorization, então aceitamos ?token= também.
    let token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
    token ??= req.query?.token;
    if (!token) throw new UnauthorizedException('sem token');
    try {
      req.user = verificarToken(token); // { sub, tenantId, papel }
    } catch {
      throw new UnauthorizedException('token invalido');
    }

    if (await this.deveBloquearPorPagamento(req)) {
      throw new HttpException('pagamento necessario', HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }

  private async deveBloquearPorPagamento(req: any): Promise<boolean> {
    if (process.env.BILLING_REQUIRED === 'false') return false;
    const path = req.path || req.url || '';
    if (path.startsWith('/billing')) return false;

    const row = await comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select status
         from assinaturas
         where tenant_id=$1
         order by criado_em desc
         limit 1`,
        [req.user.tenantId],
      );
      return r.rows[0] ?? null;
    });
    return !['ativa', 'active', 'trialing', 'CONFIRMED', 'RECEIVED'].includes(row?.status);
  }
}
