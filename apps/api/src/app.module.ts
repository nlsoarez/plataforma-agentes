import { Module } from '@nestjs/common';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({ imports: [WebhookModule, InboxModule, AuthModule, OnboardingModule] })
export class AppModule {}
