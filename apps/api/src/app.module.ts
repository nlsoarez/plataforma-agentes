import { Module } from '@nestjs/common';
import { WebhookModule } from './webhook/webhook.module';
import { InboxModule } from './inbox/inbox.module';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ProjetosModule } from './projetos/projetos.module';
import { ConversasModule } from './conversas/conversas.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { CampanhasModule } from './campanhas/campanhas.module';
import { BillingModule } from './billing/billing.module';

@Module({ imports: [WebhookModule, InboxModule, AuthModule, OnboardingModule, ProjetosModule, ConversasModule, PipelineModule, CampanhasModule, BillingModule] })
export class AppModule {}
