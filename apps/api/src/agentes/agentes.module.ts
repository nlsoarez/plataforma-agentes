import { Module } from '@nestjs/common';
import { AgentesController } from './agentes.controller';

@Module({ controllers: [AgentesController] })
export class AgentesModule {}
