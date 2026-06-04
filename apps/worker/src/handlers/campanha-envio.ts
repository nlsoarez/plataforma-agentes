import { comTenant } from '@plataforma/db';
import { CloudApiDriver } from '@plataforma/transport';
import { resolverSegredo } from '@plataforma/shared';
import { acharOuCriarConversa, gravarMensagem } from '../repos';

const driver = new CloudApiDriver(async (pid) => {
  try { return await resolverSegredo(`WABA_TOKEN_${pid}`); }
  catch { return await resolverSegredo('META_ACCESS_TOKEN'); }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tratarEnvioCampanha(job: {
  tenantId: string; campanhaId: string; envioId: string; projetoId: string;
  contatoId: string; telefone: string; phoneNumberId: string; templateNome: string; idioma: string;
}) {
  // Espaçamento anti-rajada (mesmo na API oficial, evita picos e respeita tier).
  await sleep(600 + Math.random() * 900);

  try {
    const { messageId } = await driver.enviarTemplate(job.phoneNumberId, job.telefone, { nome: job.templateNome, idioma: job.idioma });
    await comTenant(job.tenantId, async (q) => {
      const conversa = await acharOuCriarConversa(q, job.tenantId, job.projetoId, job.contatoId);
      await q(`update campanha_envios set meta_message_id=$1, status='enviado' where id=$2`, [messageId, job.envioId]);
      await gravarMensagem(q, job.tenantId, conversa.id, {
        direcao: 'outbound', autor: 'sistema', conteudo: `[campanha] ${job.templateNome}`, metaMessageId: messageId,
      });
    });
  } catch (e: any) {
    await comTenant(job.tenantId, (q) => q(`update campanha_envios set status='falha' where id=$1`, [job.envioId]));
    console.error('envio campanha falhou', job.envioId, e?.message);
  }
}
