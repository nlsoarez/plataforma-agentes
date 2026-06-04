import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('projetos')
@UseGuards(AuthGuard)
export class ProjetosController {
  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select id, nome, phone_number_id, status from projetos order by criado_em`);
      return r.rows;
    });
  }
}
