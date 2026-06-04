import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // Chamado pelo front após o popup do Embedded Signup. Protegido: a agência precisa estar logada.
  @Post('whatsapp')
  conectar(@Body() body: { code: string; wabaId: string; phoneNumberId: string }, @Req() req: any) {
    return this.svc.conectarWhatsapp(req.user.tenantId, body);
  }
}
