import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const APP_ROLES = ['owner', 'admin', 'atendente', 'cliente_final'] as const;
export type AppRole = typeof APP_ROLES[number];
const ROLES_KEY = 'app_roles';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

export function roleAllowed(role: AppRole | undefined, allowed: AppRole[]): boolean {
  return Boolean(role && allowed.includes(role));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!allowed?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    if (roleAllowed(req.user?.papel, allowed)) return true;
    throw new ForbiddenException('sem permissao para esta operacao');
  }
}
