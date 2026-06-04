import type { QueryFn } from '@plataforma/db';

export async function upsertContato(q: QueryFn, tenantId: string, projetoId: string, telefone: string): Promise<string> {
  const r = await q(
    `insert into contatos (tenant_id, projeto_id, telefone)
     values ($1,$2,$3)
     on conflict (projeto_id, telefone) do update set telefone = excluded.telefone
     returning id`,
    [tenantId, projetoId, telefone],
  );
  return r.rows[0].id;
}

export async function acharOuCriarConversa(q: QueryFn, tenantId: string, projetoId: string, contatoId: string) {
  const aberta = await q(
    `select id, ia_pausada from conversas where contato_id=$1 and status='aberta' order by atualizada_em desc limit 1`,
    [contatoId],
  );
  if (aberta.rows[0]) return aberta.rows[0] as { id: string; ia_pausada: boolean };
  const nova = await q(
    `insert into conversas (tenant_id, projeto_id, contato_id) values ($1,$2,$3) returning id, ia_pausada`,
    [tenantId, projetoId, contatoId],
  );
  return nova.rows[0] as { id: string; ia_pausada: boolean };
}

export async function gravarMensagem(
  q: QueryFn, tenantId: string, conversaId: string,
  m: { direcao: 'inbound' | 'outbound'; autor: string; conteudo: string; metaMessageId?: string; tokensIn?: number; tokensOut?: number },
) {
  await q(
    `insert into mensagens (tenant_id, conversa_id, direcao, autor, conteudo, meta_message_id, tokens_in, tokens_out)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, conversaId, m.direcao, m.autor, m.conteudo, m.metaMessageId ?? null, m.tokensIn ?? null, m.tokensOut ?? null],
  );
  await q(`update conversas set atualizada_em = now() where id=$1`, [conversaId]);
}

export async function carregarAgente(q: QueryFn, projetoId: string) {
  const r = await q(
    `select id, prompt_sistema, modelo, provider, byok_key_ref, funcoes
     from agentes where projeto_id=$1 and status='ativo' limit 1`,
    [projetoId],
  );
  return r.rows[0] ?? null;
}

export async function carregarHistorico(q: QueryFn, conversaId: string, limite = 12) {
  const r = await q(
    `select autor, conteudo from mensagens where conversa_id=$1 order by criada_em desc limit $2`,
    [conversaId, limite],
  );
  return (r.rows as { autor: string; conteudo: string }[]).reverse();
}

export async function logarAcao(q: QueryFn, tenantId: string, conversaId: string, funcao: string, argumentos: unknown, resultado: unknown) {
  await q(
    `insert into acoes_ia (tenant_id, conversa_id, funcao, argumentos, resultado) values ($1,$2,$3,$4,$5)`,
    [tenantId, conversaId, funcao, JSON.stringify(argumentos), JSON.stringify(resultado)],
  );
}
