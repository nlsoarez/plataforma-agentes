// Envia conversão Click-to-WhatsApp de volta pro Meta (Conversions API).
// Fecha o ciclo de tráfego pago: o anúncio aprende com quem virou lead/cliente.
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v21.0'}`;

export async function enviarConversao(opts: {
  ctwaClid: string; eventName: string; valor?: number; moeda?: string;
}) {
  const dataset = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!dataset || !token) throw new Error('META_DATASET_ID / META_CAPI_TOKEN ausentes');

  const body = {
    data: [{
      event_name: opts.eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { ctwa_clid: opts.ctwaClid },
      custom_data: opts.valor != null ? { value: opts.valor, currency: opts.moeda ?? 'BRL' } : undefined,
    }],
  };
  const r = await fetch(`${GRAPH()}/${dataset}/events?access_token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`capi ${r.status}: ${await r.text()}`);
  return r.json();
}
