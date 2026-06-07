import { Module } from '@nestjs/common';
import { AiSettingsController } from './ai-settings.controller';

@Module({ controllers: [AiSettingsController] })
export class AiSettingsModule {}
