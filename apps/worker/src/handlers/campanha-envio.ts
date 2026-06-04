import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { comTenant } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { acharOuCriarConversa, gravarMensagem } from '../repos';
import { dentroDoHorario, msAteProximaJanela, atrasoGaussiano, expandirSpintax, capDiario } from '../antiban';

const driver = criarDriver();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const fila = new Queue('campanhas-envio', { connection: { url: process.env.REDIS_URL } as any });

type Job = {
  tenantId: string; campanhaId: string; envioId: string; projetoId: string;
  contatoId: string; telefone: string; phoneNumberId: string; texto: string;
};

export async function tratarEnvioCampanha(job: Job) {
  // 1. Horário comercial: fora da janela, reagenda (não dispara de madrugada).
  if (!dentroDoHorario()) {
    await fila.add('envio', job, { delay: msAteProximaJanela() });
    return;
  }

  // 2. Aquecimento: teto diário por instância (cresce com a idade do número).
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chave = `warmup:${job.phoneNumberId}:${hoje}`;
  const enviadosHoje = parseInt((await redis.get(chave)) ?? '0', 10);
  const cap = capDiario(await idadeInstancia(job.tenantId, job.phoneNumberId));
  if (enviadosHoje >= cap) {
    await fila.add('envio', job, { delay: msAteProximaJanela(1) }); // tenta amanhã
    return;
  }

  // 3. Atraso humano (gaussiano) antes de enviar.
  await new Promise((r) => setTimeout(r, atrasoGaussiano()));

  // 4. Spintax: variação única por destinatário.
  const texto = expandirSpintax(job.texto);

  try {
    const { messageId } = await driver.enviarTexto(job.phoneNumberId, job.telefone, texto);
    await redis.multi().incr(chave).expire(chave, 172800).exec(); // conta no aquecimento (2 dias TTL)
    await comTenant(job.tenantId, async (q) => {
      const conversa = await acharOuCriarConversa(q, job.tenantId, job.projetoId, job.contatoId);
      await q(`update campanha_envios set meta_message_id=$1, status='enviado' where id=$2`, [messageId, job.envioId]);
      await gravarMensagem(q, job.tenantId, conversa.id, {
        direcao: 'outbound', autor: 'sistema', conteudo: texto, metaMessageId: messageId,
      });
    });
  } catch (e: any) {
    await comTenant(job.tenantId, (q) => q(`update campanha_envios set status='falha' where id=$1`, [job.envioId]));
    console.error('envio campanha falhou', job.envioId, e?.message);
  }
}

async function idadeInstancia(tenantId: string, instancia: string): Promise<number> {
  return comTenant(tenantId, async (q) => {
    const r = await q(`select criado_em from projetos where phone_number_id=$1`, [instancia]);
    if (!r.rows[0]) return 0;
    return Math.floor((Date.now() - new Date(r.rows[0].criado_em).getTime()) / 86400000);
  });
}
