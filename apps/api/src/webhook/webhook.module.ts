import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { EvolutionWebhookController } from './evolution.controller';

@Module({ controllers: [WebhookController, EvolutionWebhookController] })
export class WebhookModule {}
