import { Module } from '@nestjs/common';
import { ConversasController } from './conversas.controller';
import { ConversasService } from './conversas.service';
@Module({ controllers: [ConversasController], providers: [ConversasService] })
export class ConversasModule {}
