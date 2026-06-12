import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingReconcilerService } from './billing-reconciler.service';
import { BillingService } from './billing.service';
import { AsaasProvider } from './providers/asaas.provider';

@Module({ controllers: [BillingController], providers: [BillingService, BillingReconcilerService, AsaasProvider] })
export class BillingModule {}
