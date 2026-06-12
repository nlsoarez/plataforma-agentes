import { Module } from '@nestjs/common';
import { GoogleCalendarCallbackController, WebhooksOutController } from './webhooks-out.controller';

@Module({ controllers: [WebhooksOutController, GoogleCalendarCallbackController] })
export class WebhooksOutModule {}
