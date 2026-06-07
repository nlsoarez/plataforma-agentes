import type { QueryFn } from '@plataforma/db';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export async function buscarConhecimento(q: QueryFn, projetoId: string, consulta: string, limit = 5) {
  const queryEmbedding = await embed(consulta).catch(() => null);
  if (queryEmbedding) {
    if (queryEmbedding.length === EMBEDDING_DIMENSIONS && await pgvectorEnabled(q)) {
      const r = await q(
        `select kd.titulo, kc.conteudo, kc.chunk_index,
                1 - (kc.embedding_vector <=> $2::vector) as score
         from knowledge_chunks kc
         join knowledge_documents kd on kd.id=kc.document_id
         where kd.status='ativo'
           and (kc.projeto_id is null or kc.projeto_id=$1)
           and kc.embedding_vector is not null
         order by kc.embedding_vector <=> $2::vector
         limit $3`,
        [projetoId, toVectorLiteral(queryEmbedding), limit],
      );
      return r.rows;
    }

    const rows = (await q(
      `select kd.titulo, kc.conteudo, kc.chunk_index, kc.embedding
       from knowledge_chunks kc
       join knowledge_documents kd on kd.id=kc.document_id
       where kd.status='ativo'
         and (kc.projeto_id is null or kc.projeto_id=$1)
         and kc.embedding is not null
       limit 500`,
      [projetoId],
    )).rows;

    return rows
      .map((row: any) => ({ titulo: row.titulo, conteudo: row.conteudo, chunk_index: row.chunk_index, score: cosine(queryEmbedding, row.embedding) }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);
  }

  const r = await q(
    `select kd.titulo, kc.conteudo, kc.chunk_index,
            ts_rank(to_tsvector('portuguese', kc.conteudo), plainto_tsquery('portuguese', $2)) as score
     from knowledge_chunks kc
     join knowledge_documents kd on kd.id=kc.document_id
     where kd.status='ativo'
       and (kc.projeto_id is null or kc.projeto_id=$1)
       and to_tsvector('portuguese', kc.conteudo) @@ plainto_tsquery('portuguese', $2)
     order by score desc
     limit $3`,
    [projetoId, consulta, limit],
  );
  return r.rows;
}

async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`embedding ${r.status}: ${await r.text()}`);
  const d = await r.json() as any;
  return d.data?.[0]?.embedding ?? null;
}

function cosine(a: number[], bRaw: unknown) {
  const b = Array.isArray(bRaw) ? bRaw as number[] : [];
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function pgvectorEnabled(q: QueryFn): Promise<boolean> {
  const r = await q(
    `select 1
     from information_schema.columns
     where table_schema='public'
       and table_name='knowledge_chunks'
       and column_name='embedding_vector'
     limit 1`,
  );
  return Boolean(r.rows[0]);
}

function toVectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}
