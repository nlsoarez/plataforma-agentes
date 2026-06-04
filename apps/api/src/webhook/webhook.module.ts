import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { EvolutionWebhookController } from './evolution.controller';
import { BillingWebhookController } from './billing.controller';

@Module({ controllers: [WebhookController, EvolutionWebhookController, BillingWebhookController] })
export class WebhookModule {}
