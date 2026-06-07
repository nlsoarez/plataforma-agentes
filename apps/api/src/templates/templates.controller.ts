import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  listar(@Req() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Post()
  criar(@Body() body: { nome: string; descricao?: string; payload: any; publico?: boolean }, @Req() req: any) {
    return this.svc.criar(req.user.tenantId, body);
  }

  @Get('exportar/:projetoId')
  exportar(@Param('projetoId') projetoId: string, @Req() req: any) {
    return this.svc.exportar(req.user.tenantId, projetoId);
  }

  @Post('importar')
  importar(@Body() body: { payload: any; nomeProjeto?: string; organizacao?: string }, @Req() req: any) {
    return this.svc.importar(req.user.tenantId, body.payload, { nomeProjeto: body.nomeProjeto, organizacao: body.organizacao });
  }
}
