import { Worker } from 'bullmq';
import type { EventoNormalizado } from '@plataforma/shared';
import { tratarMensagemRecebida } from './handlers/mensagem-recebida';
import { tratarStatusEntrega } from './handlers/status-entrega';
import { tratarEnvioCampanha } from './handlers/campanha-envio';

const connection = { url: process.env.REDIS_URL } as any;

const eventos = new Worker('eventos-whatsapp', async (job) => {
  const ev = job.data as EventoNormalizado;
  switch (ev.tipo) {
    case 'mensagem_recebida': await tratarMensagemRecebida(ev); break;
    case 'status_entrega':    await tratarStatusEntrega(ev); break;
  }
}, { connection, concurrency: 5 });

// Campanhas: concorrência 1 + espaçamento por job mantém o ritmo controlado.
const campanhas = new Worker('campanhas-envio', async (job) => {
  await tratarEnvioCampanha(job.data);
}, { connection, concurrency: 1 });

eventos.on('ready', () => console.log('worker pronto: eventos-whatsapp'));
campanhas.on('ready', () => console.log('worker pronto: campanhas-envio'));
for (const w of [eventos, campanhas]) w.on('failed', (job, err) => console.error('job falhou', job?.id, err?.message));
