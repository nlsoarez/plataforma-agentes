import { carregarEnv } from '@plataforma/db';
import type { EventoNormalizado } from '@plataforma/shared';

carregarEnv();

async function main() {
  const [
    { Worker, Queue },
    { tratarMensagemRecebida },
    { tratarStatusEntrega },
    { tratarEnvioCampanha },
    { tratarRelatorioDiario, iniciarAgendadorRelatorios },
    { tratarLembreteAgendamento, iniciarAgendadorLembretes },
    { tratarScanReativacao, tratarEnvioReativacao, iniciarAgendadorReativacao },
  ] = await Promise.all([
    import('bullmq'),
    import('./handlers/mensagem-recebida'),
    import('./handlers/status-entrega'),
    import('./handlers/campanha-envio'),
    import('./handlers/relatorio-diario'),
    import('./handlers/appointment-reminders'),
    import('./handlers/lead-reactivation'),
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

  const relatoriosQueue = new Queue('relatorios-diarios', { connection });
  const relatorios = new Worker('relatorios-diarios', async (job) => {
    await tratarRelatorioDiario(job.data);
  }, { connection, concurrency: 1 });
  iniciarAgendadorRelatorios(relatoriosQueue);

  const lembretesQueue = new Queue('appointment-reminders', { connection });
  const lembretes = new Worker('appointment-reminders', async (job) => {
    await tratarLembreteAgendamento(job.data);
  }, { connection, concurrency: 1 });
  iniciarAgendadorLembretes(lembretesQueue);

  const reativacaoQueue = new Queue('lead-reactivation', { connection });
  const reativacao = new Worker('lead-reactivation', async (job) => {
    if (job.name === 'scan') await tratarScanReativacao(job.data, reativacaoQueue);
    if (job.name === 'enviar') await tratarEnvioReativacao(job.data, reativacaoQueue);
  }, { connection, concurrency: 1 });
  iniciarAgendadorReativacao(reativacaoQueue);

  eventos.on('ready', () => console.log('worker pronto: eventos-whatsapp'));
  campanhas.on('ready', () => console.log('worker pronto: campanhas-envio'));
  relatorios.on('ready', () => console.log('worker pronto: relatorios-diarios'));
  lembretes.on('ready', () => console.log('worker pronto: appointment-reminders'));
  reativacao.on('ready', () => console.log('worker pronto: lead-reactivation'));
  for (const w of [eventos, campanhas, relatorios, lembretes, reativacao]) w.on('failed', (job, err) => console.error('job falhou', job?.id, err?.message));
}

main().catch((err) => {
  console.error('worker falhou ao iniciar', err);
  process.exit(1);
});
