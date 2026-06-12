import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { verificarToken } from './jwt';
import { getSubscriptionAccess } from '../billing/entitlements';

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
    if (path.startsWith('/auth')) return false;

    const access = await getSubscriptionAccess(req.user.tenantId);
    if (access.canWrite) return false;

    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') return false;
    return true;
  }
}
