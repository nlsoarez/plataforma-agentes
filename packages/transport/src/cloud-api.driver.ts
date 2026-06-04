import type { EventoNormalizado, TemplateRef, MidiaRef } from '@plataforma/shared';
import type { TransportDriver } from './index';

// Driver OFICIAL (produção). Usa a Graph API da Meta.
// TODO: o token de acesso de cada projeto vem do cofre, resolvido por phoneNumberId.
export class CloudApiDriver implements TransportDriver {
  constructor(
    private readonly graphVersion = process.env.META_GRAPH_VERSION ?? 'v21.0',
  ) {}

  private async post(phoneNumberId: string, body: unknown): Promise<{ messageId: string }> {
    const token = await this.resolverToken(phoneNumberId);
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...(body as object) }),
      },
    );
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: data.messages?.[0]?.id ?? '' };
  }

  enviarTexto(phoneNumberId: string, para: string, texto: string) {
    return this.post(phoneNumberId, { to: para, type: 'text', text: { body: texto } });
  }

  enviarTemplate(phoneNumberId: string, para: string, t: TemplateRef) {
    return this.post(phoneNumberId, {
      to: para,
      type: 'template',
      template: { name: t.nome, language: { code: t.idioma } },
    });
  }

  enviarMidia(phoneNumberId: string, para: string, m: MidiaRef) {
    return this.post(phoneNumberId, {
      to: para,
      type: m.tipo,
      [m.tipo]: { link: m.url, caption: m.legenda },
    });
  }

  async marcarComoLida(phoneNumberId: string, messageId: string) {
    await this.post(phoneNumberId, { status: 'read', message_id: messageId });
  }

  parseWebhook(payload: unknown): EventoNormalizado[] {
    const eventos: EventoNormalizado[] = [];
    const entry = (payload as any)?.entry ?? [];
    for (const e of entry) {
      for (const change of e.changes ?? []) {
        const v = change.value ?? {};
        const phoneNumberId = v.metadata?.phone_number_id;
        for (const msg of v.messages ?? []) {
          eventos.push({
            tipo: 'mensagem_recebida',
            phoneNumberId,
            de: msg.from,
            conteudo: msg.text?.body ?? '',
            metaId: msg.id,
          });
        }
        for (const st of v.statuses ?? []) {
          const map: Record<string, 'entregue' | 'lida' | 'falha'> = {
            delivered: 'entregue', read: 'lida', failed: 'falha',
          };
          if (map[st.status]) eventos.push({ tipo: 'status_entrega', metaId: st.id, status: map[st.status] });
        }
      }
    }
    return eventos;
  }

  private async resolverToken(_phoneNumberId: string): Promise<string> {
    // TODO: buscar no cofre o token do projeto dono deste phoneNumberId.
    throw new Error('resolverToken: integrar com o cofre de segredos');
  }
}
