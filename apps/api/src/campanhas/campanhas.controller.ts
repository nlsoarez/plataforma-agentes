import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CampanhasService } from './campanhas.service';

@Controller('campanhas')
@UseGuards(AuthGuard, RolesGuard)
@Roles('owner', 'admin')
export class CampanhasController {
  constructor(private readonly svc: CampanhasService) {}

  @Post()
  criar(@Body() body: { projetoId: string; texto: string; segmento?: { tags?: string[]; contatoIds?: string[] } }, @Req() req: any) {
    return this.svc.criar(req.user.tenantId, body);
  }

  @Get()
  listar(@Query('projetoId') projetoId: string, @Req() req: any) {
    return this.svc.listar(req.user.tenantId, projetoId);
  }
}
