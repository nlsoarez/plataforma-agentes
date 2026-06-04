import { Worker } from 'bullmq';
import type { EventoNormalizado } from '@plataforma/shared';

// Consome a fila de eventos do WhatsApp.
// Aqui entra: resolver projeto -> gravar mensagem -> (se ia_pausada=false) chamar Motor de IA.
const worker = new Worker(
  'eventos-whatsapp',
  async (job) => {
    const ev = job.data as EventoNormalizado;
    switch (ev.tipo) {
      case 'mensagem_recebida':
        // TODO: resolver projeto pelo phoneNumberId, gravar em `mensagens`,
        //       e se a IA não estiver pausada, acionar o agente (function calling).
        console.log('[mensagem]', ev.phoneNumberId, ev.de, ev.conteudo);
        break;
      case 'status_entrega':
        // TODO: atualizar status_entrega da mensagem.
        console.log('[status]', ev.metaId, ev.status);
        break;
      case 'ctwa':
        // TODO: marcar origem do contato + devolver evento de conversão pro Meta Ads.
        console.log('[ctwa]', ev.de, ev.campanhaMetaId);
        break;
    }
  },
  { connection: { url: process.env.REDIS_URL } as any },
);

worker.on('ready', () => console.log('worker pronto, ouvindo eventos-whatsapp'));
