import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get()
  status(@Req() req: any) { return this.svc.status(req.user.tenantId); }

  @Post('checkout')
  checkout(@Body() body: { origem?: string }, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body.origem);
  }

  @Post('assinar')
  assinar(@Body() body: { origem?: string }, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body.origem);
  }
}
