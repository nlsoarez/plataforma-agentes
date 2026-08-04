import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(AuthGuard, RolesGuard)
@Roles('owner', 'admin')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  listar(@Req() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Get('professions')
  listarProfissoes() {
    return this.svc.listarProfissoes();
  }

  @Get('professions/:id')
  obterProfissao(@Param('id') id: string) {
    return this.svc.templateProfissao(id) || null;
  }

  @Post('professions/:id/importar')
  importarProfissao(@Param('id') id: string, @Body() body: { nomeProjeto?: string; organizacao?: string }, @Req() req: any) {
    const template = this.svc.templateProfissao(id);
    return template
      ? this.svc.importar(req.user.tenantId, template, { nomeProjeto: body.nomeProjeto || template.nome, organizacao: body.organizacao })
      : { ok: false, message: 'Template nao encontrado' };
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
