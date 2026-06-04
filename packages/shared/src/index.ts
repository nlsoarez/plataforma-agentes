// Tipos compartilhados entre api, worker e web.
// Mudou aqui = mudou em todo lugar. Fonte única de verdade.

export type Papel = 'owner' | 'admin' | 'atendente' | 'cliente_final';
export type Provider = 'openai' | 'anthropic' | 'google';
export type TransporteDriverNome = 'cloud_api' | 'evolution';

// ---- Evento normalizado: o núcleo SÓ conhece este formato ----
// Cada driver de transporte traduz o webhook bruto para um destes.
export type EventoNormalizado =
  | { tipo: 'mensagem_recebida'; phoneNumberId: string; de: string; conteudo: string; metaId: string }
  | { tipo: 'status_entrega'; metaId: string; status: 'entregue' | 'lida' | 'falha' }
  | { tipo: 'ctwa'; phoneNumberId: string; de: string; campanhaMetaId: string };

// ---- Referências de envio ----
export interface TemplateRef {
  nome: string;
  idioma: string;
  variaveis?: string[];
}
export interface MidiaRef {
  tipo: 'image' | 'document' | 'audio' | 'video';
  url: string;
  legenda?: string;
}

export { resolverSegredo } from './secrets';
