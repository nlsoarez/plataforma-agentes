import { Worker } from 'bullmq';
import type { EventoNormalizado } from '@plataforma/shared';
import { tratarMensagemRecebida } from './handlers/mensagem-recebida';
import { tratarStatusEntrega } from './handlers/status-entrega';

const worker = new Worker(
  'eventos-whatsapp',
  async (job) => {
    const ev = job.data as EventoNormalizado;
    switch (ev.tipo) {
      case 'mensagem_recebida': await tratarMensagemRecebida(ev); break;
      case 'status_entrega':    await tratarStatusEntrega(ev); break;
      case 'ctwa':
        // TODO: marcar origem do contato + devolver conversao pro Meta Ads.
        console.log('[ctwa]', ev.de, ev.campanhaMetaId);
        break;
    }
  },
  { connection: { url: process.env.REDIS_URL } as any, concurrency: 5 },
);

worker.on('ready', () => console.log('worker pronto, ouvindo eventos-whatsapp'));
worker.on('failed', (job, err) => console.error('job falhou', job?.id, err?.message));
