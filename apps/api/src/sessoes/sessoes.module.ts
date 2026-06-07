import { Module } from '@nestjs/common';
import { SessoesController } from './sessoes.controller';

@Module({ controllers: [SessoesController] })
export class SessoesModule {}
