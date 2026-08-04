import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
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

    const activeUser = await comTenant(req.user.tenantId, async (q) => {
      const result = await q(
        `select id, papel, status from usuarios where tenant_id=$1 and id=$2 limit 1`,
        [req.user.tenantId, req.user.sub],
      );
      return result.rows[0];
    });
    if (!activeUser || activeUser.status !== 'ativo') {
      throw new UnauthorizedException('usuario inativo ou removido');
    }
    req.user.papel = activeUser.papel;

    if (activeUser.papel === 'cliente_final' && !this.rotaClienteFinalPermitida(req)) {
      throw new ForbiddenException('perfil sem acesso ao painel operacional');
    }

    if (await this.deveBloquearPorPagamento(req)) {
      throw new HttpException('pagamento necessario', HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }

  private rotaClienteFinalPermitida(req: any): boolean {
    const path = String(req.path || req.url || '').split('?')[0];
    return path.startsWith('/account') || path.startsWith('/billing') || path.startsWith('/auth');
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
