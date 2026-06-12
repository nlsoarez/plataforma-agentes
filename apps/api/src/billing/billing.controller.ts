import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BillingService, SubscribeInput } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get()
  status(@Req() req: any) { return this.svc.status(req.user.tenantId); }

  @Post('checkout')
  checkout(@Body() body: SubscribeInput, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body);
  }

  @Post('assinar')
  assinar(@Body() body: SubscribeInput, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body);
  }

  @Post('sincronizar')
  sincronizar(@Req() req: any) {
    return this.svc.sincronizar(req.user.tenantId);
  }

  @Post('cancelar')
  cancelar(@Req() req: any) {
    return this.svc.cancelar(req.user.tenantId);
  }
}
