import { Module } from '@nestjs/common';
import { EquipeController } from './equipe.controller';

@Module({ controllers: [EquipeController] })
export class EquipeModule {}
