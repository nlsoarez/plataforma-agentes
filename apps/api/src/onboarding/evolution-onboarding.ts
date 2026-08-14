export const EVOLUTION_WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
] as const;

export function evolutionWebhookConfig(url: string, apikey: string) {
  return {
    enabled: true,
    url,
    headers: { apikey },
    byEvents: false,
    base64: true,
    events: [...EVOLUTION_WEBHOOK_EVENTS],
  };
}

export function evolutionCreatePayload(instanceName: string, webhookUrl = '', webhookApikey = '') {
  return {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    ...(webhookUrl && webhookApikey
      ? { webhook: evolutionWebhookConfig(webhookUrl, webhookApikey) }
      : {}),
  };
}

export function extractEvolutionQr(data: any) {
  const qr =
    data?.base64 ??
    data?.qrcode?.base64 ??
    data?.qrcode?.qrCode ??
    data?.qrcode?.code ??
    data?.qrCode ??
    null;

  return {
    qr,
    qrCode: data?.code ?? data?.qrcode?.code ?? null,
    pairingCode: data?.pairingCode ?? data?.qrcode?.pairingCode ?? null,
  };
}
