import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get()
  status(@Req() req: any) { return this.svc.status(req.user.tenantId); }

  @Post('assinar')
  assinar(@Body() body: { nome: string; cpfCnpj: string; email: string; billingType?: string }, @Req() req: any) {
    return this.svc.assinar(req.user.tenantId, body);
  }
}
