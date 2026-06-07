import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('agenda')
@UseGuards(AuthGuard)
export class AgendaController {
  @Get()
  listar(@Req() req: any, @Query('projetoId') projetoId?: string) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select a.id, a.projeto_id, p.nome as projeto_nome, a.conversa_id, a.contato_id,
                c.nome as contato_nome, c.telefone, a.inicio_em, a.descricao, a.status,
                a.provider, a.provider_ref, a.erro, a.criado_em
         from agendamentos a
         join projetos p on p.id=a.projeto_id
         left join contatos c on c.id=a.contato_id
         where ($1::uuid is null or a.projeto_id=$1)
         order by a.inicio_em desc
         limit 200`,
        [projetoId || null],
      );
      return r.rows;
    });
  }
}
