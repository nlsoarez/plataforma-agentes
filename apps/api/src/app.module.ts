import { Module } from '@nestjs/common';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';

@Module({ imports: [WebhookModule, InboxModule] })
export class AppModule {}
