import { Module } from '@nestjs/common';
import { AutomacoesController } from './automacoes.controller';

@Module({ controllers: [AutomacoesController] })
export class AutomacoesModule {}
