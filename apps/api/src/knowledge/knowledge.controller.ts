import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { KnowledgeService } from './knowledge.service';
import { assertLimit } from '../billing/entitlements';

@Controller('knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  @Get()
  listar(@Query('projetoId') projetoId: string | undefined, @Req() req: any) {
    return this.svc.listar(req.user.tenantId, projetoId);
  }

  @Post()
  async criar(@Body() body: { projetoId?: string; titulo: string; conteudo: string; tipo?: string; metadata?: any }, @Req() req: any) {
    const bytes = Buffer.byteLength(body.conteudo || '', 'utf8');
    await assertLimit(req.user.tenantId, 'knowledge_documents', 1);
    await assertLimit(req.user.tenantId, 'knowledge_document_size_bytes', bytes);
    await assertLimit(req.user.tenantId, 'storage_bytes', bytes);
    return this.svc.criar(req.user.tenantId, body);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @Req() req: any) {
    return this.svc.excluir(req.user.tenantId, id);
  }
}
