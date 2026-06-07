import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('projetos')
@UseGuards(AuthGuard)
export class ProjetosController {
  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, nome, phone_number_id, status, connection_state
         from projetos
         order by
           case
             when connection_state='open' then 0
             when status='ativo' then 1
             else 2
           end,
           criado_em desc`,
      );
      return r.rows;
    });
  }
}
