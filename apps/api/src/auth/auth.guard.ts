import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verificarToken } from './jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h: string | undefined = req.headers['authorization'];
    // SSE (EventSource) não envia header Authorization, então aceitamos ?token= também.
    let token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
    token ??= req.query?.token;
    if (!token) throw new UnauthorizedException('sem token');
    try {
      req.user = verificarToken(token); // { sub, tenantId, papel }
      return true;
    } catch {
      throw new UnauthorizedException('token invalido');
    }
  }
}
