import { comTenant } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { acharOuCriarConversa, gravarMensagem } from '../repos';

const driver = criarDriver();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tratarEnvioCampanha(job: {
  tenantId: string; campanhaId: string; envioId: string; projetoId: string;
  contatoId: string; telefone: string; phoneNumberId: string; texto: string;
}) {
  // Espaçamento anti-rajada (mesmo na API oficial, evita picos e respeita tier).
  await sleep(600 + Math.random() * 900);

  try {
    const { messageId } = await driver.enviarTexto(job.phoneNumberId, job.telefone, job.texto);
    await comTenant(job.tenantId, async (q) => {
      const conversa = await acharOuCriarConversa(q, job.tenantId, job.projetoId, job.contatoId);
      await q(`update campanha_envios set meta_message_id=$1, status='enviado' where id=$2`, [messageId, job.envioId]);
      await gravarMensagem(q, job.tenantId, conversa.id, {
        direcao: 'outbound', autor: 'sistema', conteudo: job.texto, metaMessageId: messageId,
      });
    });
  } catch (e: any) {
    await comTenant(job.tenantId, (q) => q(`update campanha_envios set status='falha' where id=$1`, [job.envioId]));
    console.error('envio campanha falhou', job.envioId, e?.message);
  }
}
