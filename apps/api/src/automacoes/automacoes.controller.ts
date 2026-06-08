import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { assertLimit } from '../billing/entitlements';

@Controller('automacoes')
@UseGuards(AuthGuard)
export class AutomacoesController {
  @Get()
  listar(@Query('projetoId') projetoId: string | undefined, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, projeto_id, nome, gatilho, condicoes, acoes, ativo, criado_em
         from automacoes
         where ($1::uuid is null or projeto_id=$1)
         order by criado_em desc`,
        [projetoId || null],
      );
      return r.rows;
    });
  }

  @Post()
  async salvar(@Body() body: { id?: string; projetoId?: string; nome: string; gatilho: string; condicoes?: any; acoes?: any[]; ativo?: boolean }, @Req() req: any) {
    const willBeActive = body.ativo ?? true;
    if (willBeActive) {
      const consumesNewSlot = await comTenant(req.user.tenantId, async (q) => {
        if (!body.id) return true;
        const r = await q(`select ativo from automacoes where id=$1`, [body.id]);
        return r.rows[0]?.ativo === false;
      });
      if (consumesNewSlot) await assertLimit(req.user.tenantId, 'active_automations', 1);
    }

    return comTenant(req.user.tenantId, async (q) => {
      if (body.id) {
        const r = await q(
          `update automacoes
           set nome=$2, gatilho=$3, condicoes=$4, acoes=$5, ativo=$6
           where id=$1
           returning id, projeto_id, nome, gatilho, condicoes, acoes, ativo, criado_em`,
          [body.id, body.nome, body.gatilho, JSON.stringify(body.condicoes ?? {}), JSON.stringify(body.acoes ?? []), body.ativo ?? true],
        );
        return r.rows[0];
      }
      const r = await q(
        `insert into automacoes (tenant_id, projeto_id, nome, gatilho, condicoes, acoes, ativo)
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id, projeto_id, nome, gatilho, condicoes, acoes, ativo, criado_em`,
        [req.user.tenantId, body.projetoId || null, body.nome, body.gatilho, JSON.stringify(body.condicoes ?? {}), JSON.stringify(body.acoes ?? []), body.ativo ?? true],
      );
      return r.rows[0];
    });
  }

  @Delete(':id')
  desativar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await q(`update automacoes set ativo=false where id=$1`, [id]);
      return { ok: true };
    });
  }
}
