import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(AuthGuard, RolesGuard)
@Roles('owner', 'admin')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  @Post('instancia')
  criar(@Body() body: { nome: string; projetoId?: string }, @Req() req: any) {
    return this.svc.criarInstancia(req.user.tenantId, body.nome, body.projetoId);
  }

  @Get('instancia/:instancia/qr')
  qr(@Param('instancia') instancia: string, @Req() req: any) {
    return this.svc.qr(req.user.tenantId, instancia);
  }

  @Get('instancia/:instancia/status')
  status(@Param('instancia') instancia: string, @Req() req: any) {
    return this.svc.status(req.user.tenantId, instancia);
  }
}
