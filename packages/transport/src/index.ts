import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';

// Contrato único de transporte. A lógica de negócio fala SÓ com esta interface,
// nunca com a Cloud API ou Evolution diretamente. Trocar de driver não toca no núcleo.
export interface TransportDriver {
  enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<{ messageId: string }>;
  enviarTemplate(phoneNumberId: string, para: string, t: TemplateRef): Promise<{ messageId: string }>;
  enviarMidia(phoneNumberId: string, para: string, m: MidiaRef): Promise<{ messageId: string }>;
  marcarComoLida(phoneNumberId: string, messageId: string): Promise<void>;
  // Traduz o payload bruto do webhook para eventos normalizados.
  parseWebhook(payload: unknown): EventoNormalizado[];
}

export { CloudApiDriver } from './cloud-api.driver';
export { EvolutionDriver } from './evolution.driver';
