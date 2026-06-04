import { comTenant, resolverProjetoPorNumero } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { publicar } from '@plataforma/bus';
import {
  upsertContato, acharOuCriarConversa, gravarMensagem,
  carregarAgente, carregarHistorico,
} from '../repos';
import { rodarAgente } from '../agent/agente';

const driver = criarDriver();

export async function tratarMensagemRecebida(ev: {
  phoneNumberId: string; de: string; conteudo: string; metaId: string;
  referral?: { ctwaClid?: string; sourceId?: string };
}) {
  const rota = await resolverProjetoPorNumero(ev.phoneNumberId);
  if (!rota) { console.warn('[rota] projeto ativo nao encontrado para', ev.phoneNumberId); return; }
  const { tenant_id: tenantId, projeto_id: projetoId } = rota;

  await comTenant(tenantId, async (q) => {
    const contatoId = await upsertContato(q, tenantId, projetoId, ev.de);
    if (ev.referral?.ctwaClid) {
      await q(`update contatos set ctwa_clid=$1, origem='ctwa' where id=$2`, [ev.referral.ctwaClid, contatoId]);
    }
    const conversa = await acharOuCriarConversa(q, tenantId, projetoId, contatoId);

    await gravarMensagem(q, tenantId, conversa.id, {
      direcao: 'inbound', autor: 'contato', conteudo: ev.conteudo, metaMessageId: ev.metaId,
    });
    await publicar(tenantId, { tipo: 'mensagem', conversaId: conversa.id, autor: 'contato', conteudo: ev.conteudo });

    if (conversa.ia_pausada) return; // humano cuida

    const agente = await carregarAgente(q, projetoId);
    if (!agente) { console.warn('[agente] nenhum agente ativo no projeto', projetoId); return; }

    const historico = await carregarHistorico(q, conversa.id);
    const resultado = await rodarAgente({
      agente, historico,
      ctx: { q, tenantId, projetoId, conversaId: conversa.id, contatoId },
    });

    if (resultado.texto) {
      const { messageId } = await driver.enviarTexto(ev.phoneNumberId, ev.de, resultado.texto);
      await gravarMensagem(q, tenantId, conversa.id, {
        direcao: 'outbound', autor: 'ia', conteudo: resultado.texto,
        metaMessageId: messageId, tokensIn: resultado.tokensIn, tokensOut: resultado.tokensOut,
      });
      await publicar(tenantId, { tipo: 'mensagem', conversaId: conversa.id, autor: 'ia', conteudo: resultado.texto });
    }

    if (resultado.handoff) {
      await publicar(tenantId, { tipo: 'handoff', conversaId: conversa.id });
    }
  });
}
