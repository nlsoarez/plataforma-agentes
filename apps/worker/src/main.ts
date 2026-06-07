import { carregarEnv } from '@plataforma/db';
import type { EventoNormalizado } from '@plataforma/shared';

carregarEnv();

async function main() {
  const [{ Worker }, { tratarMensagemRecebida }, { tratarStatusEntrega }, { tratarEnvioCampanha }] = await Promise.all([
    import('bullmq'),
    import('./handlers/mensagem-recebida'),
    import('./handlers/status-entrega'),
    import('./handlers/campanha-envio'),
  ]);

  const connection = { url: process.env.REDIS_URL } as any;

  const eventos = new Worker('eventos-whatsapp', async (job) => {
    const ev = job.data as EventoNormalizado;
    switch (ev.tipo) {
      case 'mensagem_recebida': await tratarMensagemRecebida(ev); break;
      case 'status_entrega':    await tratarStatusEntrega(ev); break;
    }
  }, { connection, concurrency: 5 });

  // Campanhas: concorrencia 1 + espacamento por job mantem o ritmo controlado.
  const campanhas = new Worker('campanhas-envio', async (job) => {
    await tratarEnvioCampanha(job.data);
  }, { connection, concurrency: 1 });

  eventos.on('ready', () => console.log('worker pronto: eventos-whatsapp'));
  campanhas.on('ready', () => console.log('worker pronto: campanhas-envio'));
  for (const w of [eventos, campanhas]) w.on('failed', (job, err) => console.error('job falhou', job?.id, err?.message));
}

main().catch((err) => {
  console.error('worker falhou ao iniciar', err);
  process.exit(1);
});
