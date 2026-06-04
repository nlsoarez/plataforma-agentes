import { Injectable, UnauthorizedException } from '@nestjs/common';
import { comTenant, resolverTenantPorDominio } from '@plataforma/db';
import { verificarSenha } from './senha';
import { assinarToken } from './jwt';

@Injectable()
export class AuthService {
  // Login é escopado pelo domínio da agência (white-label): o mesmo email pode
  // existir em agências diferentes, então o tenant vem do domínio, não do email.
  async login(dominio: string, email: string, senha: string): Promise<{ token: string }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const user = await comTenant(tenant.id, async (q) => {
      const r = await q(`select id, senha_hash, papel from usuarios where email=$1`, [email]);
      return r.rows[0];
    });
    if (!user || !verificarSenha(senha, user.senha_hash)) {
      throw new UnauthorizedException('credenciais invalidas');
    }
    return { token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }) };
  }
}
