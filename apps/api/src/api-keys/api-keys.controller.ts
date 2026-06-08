import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { hashApiKey } from '../public-api/api-key-auth';
import { assertFeature, assertLimit } from '../billing/entitlements';

@Controller('api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, nome, prefixo, escopos, ultimo_uso_em, ativo, criado_em
         from api_keys
         order by criado_em desc`,
      );
      return r.rows;
    });
  }

  @Post()
  async criar(@Body() body: { nome?: string; escopos?: string[] }, @Req() req: any) {
    await assertFeature(req.user.tenantId, 'public_api');
    await assertLimit(req.user.tenantId, 'public_api_keys', 1);
    return comTenant(req.user.tenantId, async (q) => {
      const secret = `nl_${randomBytes(24).toString('base64url')}`;
      const prefixo = secret.slice(0, 10);
      const escopos = body.escopos?.length ? body.escopos : ['messages', 'leads', 'kanban', 'tags'];
      const r = await q(
        `insert into api_keys (tenant_id, nome, key_hash, prefixo, escopos)
         values ($1,$2,$3,$4,$5)
         returning id, nome, prefixo, escopos, criado_em`,
        [req.user.tenantId, body.nome || 'Chave API', hashApiKey(secret), prefixo, escopos],
      );
      return { ...r.rows[0], apiKey: secret };
    });
  }

  @Delete(':id')
  revogar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await q(`update api_keys set ativo=false where id=$1`, [id]);
      return { ok: true };
    });
  }
}
