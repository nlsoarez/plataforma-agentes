import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AsaasProvider } from './providers/asaas.provider';

@Module({ controllers: [BillingController], providers: [BillingService, AsaasProvider] })
export class BillingModule {}
