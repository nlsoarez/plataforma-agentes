import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';
import type { TransportDriver } from './index';

// Driver Evolution API (não-oficial). 'rota' aqui é o NOME DA INSTÂNCIA.
// Apikey global do Evolution via env. URL base via env.
export class EvolutionDriver implements TransportDriver {
  constructor(
    private base = (process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, ''),
    private apikey = process.env.EVOLUTION_API_KEY ?? '',
  ) {}

  private headers() { return { apikey: this.apikey, 'Content-Type': 'application/json' }; }

  private assertConfig() {
    if (!this.base) throw new Error('EVOLUTION_API_URL nao configurada');
    if (!this.apikey) throw new Error('EVOLUTION_API_KEY nao configurada');
  }

  private normalizarNumero(numero: string) {
    return String(numero || '').replace(/@.*/, '').replace(/\D/g, '');
  }

  async enviarTexto(instancia: string, para: string, texto: string) {
    this.assertConfig();
    const r = await fetch(`${this.base}/message/sendText/${instancia}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ number: this.normalizarNumero(para), text: texto }),
    });
    if (!r.ok) throw new Error(`evolution sendText ${r.status}: ${await r.text()}`);
    const d = (await r.json()) as any;
    return { messageId: d?.key?.id ?? d?.messageId ?? '' };
  }

  async enviarTemplate(_instancia: string, _para: string, _t: TemplateRef): Promise<{ messageId: string }> {
    throw new Error('Evolution nao tem templates oficiais; use enviarTexto');
  }

  async enviarMidia(instancia: string, para: string, m: MidiaRef) {
    this.assertConfig();
    const r = await fetch(`${this.base}/message/sendMedia/${instancia}`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ number: this.normalizarNumero(para), mediatype: m.tipo, media: m.url, caption: m.legenda }),
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
    const instancia = this.extrairInstancia(body);
    const evento = String(body?.event ?? '').toLowerCase().replace(/_/g, '.');
    const data = body?.data;
    if (!instancia || !data) return [];
    const eventos: any[] = [];

    if (evento === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : data.messages ? data.messages : [data];
      for (const m of msgs) {
        const key = m?.key;
        if (!key || key.fromMe) continue;                 // ignora ecos de saída
        const jid: string = key.remoteJid ?? '';
        if (jid.endsWith('@g.us')) continue;              // ignora grupos
        const numero = this.normalizarNumero(jid);
        const midia = this.extrairMidia(m);
        const texto = m?.message?.conversation
          ?? m?.message?.extendedTextMessage?.text
          ?? midia?.caption
          ?? (midia ? `[midia:${midia.tipo}]` : '');
        eventos.push({ tipo: 'mensagem_recebida', phoneNumberId: instancia, de: numero, conteudo: texto, metaId: key.id, midia });
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
    return eventos as EventoNormalizado[];
  }

  private extrairInstancia(body: any): string | null {
    if (typeof body?.instance === 'string') return body.instance;
    return body?.instance?.instanceName
      ?? body?.instance?.name
      ?? body?.data?.instanceName
      ?? body?.data?.instance
      ?? body?.data?.instanceId
      ?? null;
  }

  private extrairMidia(m: any): Extract<EventoNormalizado, { tipo: 'mensagem_recebida' }>['midia'] | undefined {
    const msg = m?.message ?? {};
    const candidates = [
      ['image', msg.imageMessage],
      ['audio', msg.audioMessage],
      ['video', msg.videoMessage],
      ['document', msg.documentMessage],
      ['sticker', msg.stickerMessage],
    ] as const;
    for (const [tipo, data] of candidates) {
      if (!data) continue;
      return {
        tipo,
        url: data.url,
        mime: data.mimetype,
        fileName: data.fileName,
        caption: data.caption,
        raw: data,
      };
    }
    return undefined;
  }
}
