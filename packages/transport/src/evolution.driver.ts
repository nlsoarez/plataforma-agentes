import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';
import type { TransportDriver } from './index';

// Driver Evolution API (não-oficial). 'rota' aqui é o NOME DA INSTÂNCIA.
// Apikey global do Evolution via env. URL base via env.
export class EvolutionDriver implements TransportDriver {
  constructor(
    private base = process.env.EVOLUTION_API_URL ?? '',
    private apikey = process.env.EVOLUTION_API_KEY ?? '',
  ) {}

  private headers() { return { apikey: this.apikey, 'Content-Type': 'application/json' }; }

  async enviarTexto(instancia: string, para: string, texto: string) {
    const r = await fetch(`${this.base}/message/sendText/${instancia}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ number: para, text: texto }),
    });
    if (!r.ok) throw new Error(`evolution sendText ${r.status}: ${await r.text()}`);
    const d = (await r.json()) as any;
    return { messageId: d?.key?.id ?? d?.messageId ?? '' };
  }

  async enviarTemplate(_instancia: string, _para: string, _t: TemplateRef): Promise<{ messageId: string }> {
    throw new Error('Evolution nao tem templates oficiais; use enviarTexto');
  }

  async enviarMidia(instancia: string, para: string, m: MidiaRef) {
    const r = await fetch(`${this.base}/message/sendMedia/${instancia}`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ number: para, mediatype: m.tipo, media: m.url, caption: m.legenda }),
    });
    if (!r.ok) throw new Error(`evolution sendMedia ${r.status}: ${await r.text()}`);
    const d = (await r.json()) as any;
    return { messageId: d?.key?.id ?? '' };
  }

  async marcarComoLida(_instancia: string, _messageId: string): Promise<void> {
    // Opcional no Evolution (exige remoteJid completo). No-op por ora.
  }

  // Normaliza os webhooks do Evolution para o formato único do núcleo.
  parseWebhook(payload: unknown): EventoNormalizado[] {
    const body = payload as any;
    const instancia = typeof body?.instance === 'string' ? body.instance : body?.instance?.instanceName;
    const evento = String(body?.event ?? '').toLowerCase().replace(/_/g, '.');
    const data = body?.data;
    if (!instancia || !data) return [];
    const eventos: EventoNormalizado[] = [];

    if (evento === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : data.messages ? data.messages : [data];
      for (const m of msgs) {
        const key = m?.key;
        if (!key || key.fromMe) continue;                 // ignora ecos de saída
        const jid: string = key.remoteJid ?? '';
        if (jid.endsWith('@g.us')) continue;              // ignora grupos
        const numero = jid.split('@')[0];
        const texto = m?.message?.conversation
          ?? m?.message?.extendedTextMessage?.text
          ?? m?.message?.imageMessage?.caption ?? '';
        eventos.push({ tipo: 'mensagem_recebida', phoneNumberId: instancia, de: numero, conteudo: texto, metaId: key.id });
      }
    } else if (evento === 'messages.update') {
      const ups = Array.isArray(data) ? data : [data];
      for (const u of ups) {
        const id = u?.keyId ?? u?.key?.id;
        const raw = String(u?.status ?? u?.update?.status ?? '').toUpperCase();
        const map: Record<string, 'entregue' | 'lida' | 'falha'> = {
          DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falha',
        };
        if (id && map[raw]) eventos.push({ tipo: 'status_entrega', phoneNumberId: instancia, metaId: id, status: map[raw] });
      }
    }
    // connection.update e qrcode.updated não geram evento de negócio aqui.
    return eventos;
  }
}
