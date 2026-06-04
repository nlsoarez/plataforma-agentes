import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';
import type { TransportDriver } from './index';

// Driver NÃO-OFICIAL. APENAS para protótipo interno seu.
// NUNCA entregar a clientes: disparo em massa não-oficial bane o número.
export class EvolutionDriver implements TransportDriver {
  async enviarTexto(): Promise<{ messageId: string }> { throw new Error('protótipo'); }
  async enviarTemplate(_p: string, _t: string, _x: TemplateRef): Promise<{ messageId: string }> { throw new Error('protótipo'); }
  async enviarMidia(_p: string, _t: string, _m: MidiaRef): Promise<{ messageId: string }> { throw new Error('protótipo'); }
  async marcarComoLida(): Promise<void> { throw new Error('protótipo'); }
  parseWebhook(_payload: unknown): EventoNormalizado[] { return []; }
}
