import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  @Get()
  listar(@Query('projetoId') projetoId: string | undefined, @Req() req: any) {
    return this.svc.listar(req.user.tenantId, projetoId);
  }

  @Post()
  criar(@Body() body: { projetoId?: string; titulo: string; conteudo: string; tipo?: string; metadata?: any }, @Req() req: any) {
    return this.svc.criar(req.user.tenantId, body);
  }

  @Delete(':id')
  desativar(@Param('id') id: string, @Req() req: any) {
    return this.svc.desativar(req.user.tenantId, id);
  }
}
