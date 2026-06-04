// Tipos compartilhados entre api, worker e web.
export type Papel = 'owner' | 'admin' | 'atendente' | 'cliente_final';
export type Provider = 'openai' | 'anthropic' | 'google';
export type TransporteDriverNome = 'cloud_api' | 'evolution';

export type EventoNormalizado =
  | { tipo: 'mensagem_recebida'; phoneNumberId: string; de: string; conteudo: string; metaId: string }
  | { tipo: 'status_entrega'; phoneNumberId: string; metaId: string; status: 'entregue' | 'lida' | 'falha' }
  | { tipo: 'ctwa'; phoneNumberId: string; de: string; campanhaMetaId: string };

export interface TemplateRef { nome: string; idioma: string; variaveis?: string[]; }
export interface MidiaRef { tipo: 'image' | 'document' | 'audio' | 'video'; url: string; legenda?: string; }

// Conteúdo do JWT de sessão.
export interface Sessao { sub: string; tenantId: string; papel: Papel; }

export { resolverSegredo, guardarSegredo } from './secrets';
