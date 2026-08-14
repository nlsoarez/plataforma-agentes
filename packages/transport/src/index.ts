import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';
import { resolverSegredo } from '@plataforma/shared';

// Contrato único de transporte. A lógica de negócio fala SÓ com esta interface.
// Trocar Evolution <-> Cloud API oficial não toca no núcleo.
export interface TransportDriver {
  enviarTexto(rota: string, para: string, texto: string): Promise<{ messageId: string }>;
  enviarTemplate(rota: string, para: string, t: TemplateRef): Promise<{ messageId: string }>;
  enviarMidia(rota: string, para: string, m: MidiaRef): Promise<{ messageId: string }>;
  marcarComoLida(rota: string, messageId: string): Promise<void>;
  parseWebhook(payload: unknown): EventoNormalizado[];
}

export { CloudApiDriver } from './cloud-api.driver';
export { EvolutionDriver } from './evolution.driver';
export { isPublicIp, resolveSafeWebhookTarget, safeWebhookPost } from './safe-webhook';
export type { SafeWebhookResponse } from './safe-webhook';

import { CloudApiDriver } from './cloud-api.driver';
import { EvolutionDriver } from './evolution.driver';

// Fábrica: escolhe o transporte por env. Fase 1 = evolution; Fase 2 = cloud_api.
// 'rota' é a chave de roteamento: instância (Evolution) ou phone_number_id (Cloud API).
export function criarDriver(): TransportDriver {
  const tipo = process.env.TRANSPORTE_DRIVER ?? 'evolution';
  if (tipo === 'cloud_api') {
    return new CloudApiDriver(async (rota) => {
      try { return await resolverSegredo(`WABA_TOKEN_${rota}`); }
      catch { return await resolverSegredo('META_ACCESS_TOKEN'); }
    });
  }
  return new EvolutionDriver();
}
