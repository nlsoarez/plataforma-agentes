import { Module } from '@nestjs/common';
import { WebhooksOutController } from './webhooks-out.controller';

@Module({ controllers: [WebhooksOutController] })
export class WebhooksOutModule {}
