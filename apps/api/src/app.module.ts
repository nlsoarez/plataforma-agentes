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
import { AgentesModule } from './agentes/agentes.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { WebhooksOutModule } from './webhooks-out/webhooks-out.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AutomacoesModule } from './automacoes/automacoes.module';
import { SessoesModule } from './sessoes/sessoes.module';
import { LeadsModule } from './leads/leads.module';
import { PublicApiModule } from './public-api/public-api.module';
import { SettingsModule } from './settings/settings.module';
import { EquipeModule } from './equipe/equipe.module';
import { AiSettingsModule } from './ai-settings/ai-settings.module';
import { TemplatesModule } from './templates/templates.module';
import { AgendaModule } from './agenda/agenda.module';
import { HealthModule } from './health/health.module';
import { AccountModule } from './account/account.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    WebhookModule, InboxModule, AuthModule, OnboardingModule, ProjetosModule,
    ConversasModule, PipelineModule, CampanhasModule, BillingModule, AgentesModule,
    ApiKeysModule, WebhooksOutModule, KnowledgeModule, AutomacoesModule,
    SessoesModule, LeadsModule, PublicApiModule, SettingsModule, EquipeModule,
    AiSettingsModule, TemplatesModule, AgendaModule, HealthModule, AccountModule,
    ReportsModule,
  ],
})
export class AppModule {}
