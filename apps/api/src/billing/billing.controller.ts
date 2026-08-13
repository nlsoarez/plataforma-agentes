import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { BillingService, SubscribeInput } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get()
  status(@Req() req: any) { return this.svc.status(req.user.tenantId); }

  @Post('checkout')
  @Roles('owner', 'admin')
  checkout(@Body() body: SubscribeInput, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body);
  }

  @Post('assinar')
  @Roles('owner', 'admin')
  assinar(@Body() body: SubscribeInput, @Req() req: any) {
    return this.svc.criarCheckout(req.user.tenantId, req.user.sub, body);
  }

  @Post('sincronizar')
  @Roles('owner', 'admin')
  sincronizar(@Req() req: any) {
    return this.svc.sincronizar(req.user.tenantId);
  }

  @Post('cancelar')
  @Roles('owner', 'admin')
  cancelar(@Req() req: any) {
    return this.svc.cancelar(req.user.tenantId);
  }
}
