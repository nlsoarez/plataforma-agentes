import { Module } from '@nestjs/common';
import { ProjetosController } from './projetos.controller';
@Module({ controllers: [ProjetosController] })
export class ProjetosModule {}
