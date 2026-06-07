import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  @Get()
  listar(@Query('projetoId') projetoId: string | undefined, @Query('q') busca: string | undefined, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select c.id, c.projeto_id, p.nome as projeto_nome, c.nome, c.telefone, c.tags,
                c.notes, c.metadata, c.unread_messages, c.ai_response_block_until,
                c.ultima_interacao, c.origem, c.criado_em,
                e.id as etapa_id, e.nome as etapa_nome
         from contatos c
         join projetos p on p.id=c.projeto_id
         left join etapas_pipeline e on e.id=c.etapa_pipeline
         where ($1::uuid is null or c.projeto_id=$1)
           and ($2::text is null or c.telefone ilike '%' || $2 || '%' or c.nome ilike '%' || $2 || '%')
         order by coalesce(c.ultima_interacao, c.criado_em) desc
         limit 200`,
        [projetoId || null, busca || null],
      );
      return r.rows;
    });
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `update contatos
         set nome=coalesce($2,nome),
             notes=coalesce($3,notes),
             metadata=coalesce($4::jsonb,metadata),
             tags=coalesce($5::text[],tags),
             etapa_pipeline=coalesce($6::uuid,etapa_pipeline),
             responsavel_id=coalesce($7::uuid,responsavel_id),
             departamento_id=coalesce($8::uuid,departamento_id),
             ai_response_block_until=$9::timestamptz
         where id=$1
         returning *`,
        [
          id,
          body.nome ?? null,
          body.notes ?? null,
          body.metadata ? JSON.stringify(body.metadata) : null,
          body.tags ?? null,
          body.etapaId ?? null,
          body.responsavelId ?? null,
          body.departamentoId ?? null,
          body.ai_response_block_until ?? null,
        ],
      );
      return r.rows[0];
    });
  }
}
