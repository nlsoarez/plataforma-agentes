import { Module } from '@nestjs/common';
import { PublicBrandingController, SettingsController } from './settings.controller';

@Module({ controllers: [PublicBrandingController, SettingsController] })
export class SettingsModule {}
