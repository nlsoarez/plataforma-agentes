import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
@UseGuards(AuthGuard)
export class PipelineController {
  constructor(private readonly svc: PipelineService) {}

  @Get()
  quadro(@Query('projetoId') projetoId: string, @Req() req: any) {
    return this.svc.quadro(req.user.tenantId, projetoId);
  }

  @Post('mover')
  mover(@Body() body: { contatoId: string; etapaId: string }, @Req() req: any) {
    return this.svc.mover(req.user.tenantId, body.contatoId, body.etapaId);
  }
}
