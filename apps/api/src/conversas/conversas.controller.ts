import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ConversasService } from './conversas.service';

@Controller('conversas')
@UseGuards(AuthGuard)
export class ConversasController {
  constructor(private readonly svc: ConversasService) {}

  @Get()
  listar(@Query('projetoId') projetoId: string, @Req() req: any) {
    return this.svc.listar(req.user.tenantId, projetoId);
  }

  @Get(':id/mensagens')
  mensagens(@Param('id') id: string, @Req() req: any) {
    return this.svc.mensagens(req.user.tenantId, id);
  }

  @Post(':id/responder')
  responder(@Param('id') id: string, @Body() body: { texto: string }, @Req() req: any) {
    return this.svc.responder(req.user.tenantId, id, body.texto);
  }

  @Post(':id/ia')
  ia(@Param('id') id: string, @Body() body: { pausar: boolean }, @Req() req: any) {
    return this.svc.definirIa(req.user.tenantId, id, body.pausar);
  }
}
