import { Injectable } from '@nestjs/common';
import type { QueryFn } from '@plataforma/db';
import { comTenant } from '@plataforma/db';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const MAX_CHARS = 1800;
const OVERLAP = 220;
const EMBEDDING_DIMENSIONS = 1536;

@Injectable()
export class KnowledgeService {
  async listar(tenantId: string, projetoId?: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `select id, projeto_id, titulo, tipo, status, criado_em, chunk_count, embedding_model, indexado_em,
                left(conteudo, 220) as preview
         from knowledge_documents
         where ($1::uuid is null or projeto_id=$1)
         order by criado_em desc`,
        [projetoId || null],
      );
      return r.rows;
    });
  }

  async criar(tenantId: string, body: { projetoId?: string; titulo: string; conteudo: string; tipo?: string; metadata?: any }) {
    return comTenant(tenantId, async (q) => {
      const doc = await q(
        `insert into knowledge_documents (tenant_id, projeto_id, titulo, tipo, conteudo, metadata)
         values ($1,$2,$3,$4,$5,$6)
         returning id, projeto_id, titulo, tipo, status, criado_em`,
        [tenantId, body.projetoId || null, body.titulo, body.tipo || 'text', body.conteudo, JSON.stringify(body.metadata ?? {})],
      );
      const documentId = doc.rows[0].id;
      const chunks = chunkText(body.conteudo);
      const embeddings = await this.embedMany(chunks).catch(() => null);
      const vectorEnabled = embeddings ? await pgvectorEnabled(q) : false;

      for (let i = 0; i < chunks.length; i++) {
        const embedding = embeddings?.[i] ?? null;
        const baseParams = [
          tenantId,
          documentId,
          body.projetoId || null,
          i,
          chunks[i],
          Math.ceil(chunks[i].length / 4),
          embedding ? JSON.stringify(embedding) : null,
        ];
        if (vectorEnabled && embedding?.length === EMBEDDING_DIMENSIONS) {
          await q(
            `insert into knowledge_chunks (
               tenant_id, document_id, projeto_id, chunk_index, conteudo, token_est, embedding, embedding_vector
             )
             values ($1,$2,$3,$4,$5,$6,$7,$8::vector)`,
            [...baseParams, toVectorLiteral(embedding)],
          );
        } else {
          await q(
            `insert into knowledge_chunks (tenant_id, document_id, projeto_id, chunk_index, conteudo, token_est, embedding)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            baseParams,
          );
        }
      }

      await q(
        `update knowledge_documents
         set chunk_count=$2, embedding_model=$3, indexado_em=now()
         where id=$1`,
        [documentId, chunks.length, embeddings ? EMBEDDING_MODEL : null],
      );

      return { ...doc.rows[0], chunk_count: chunks.length, embedding_model: embeddings ? EMBEDDING_MODEL : null };
    });
  }

  async excluir(tenantId: string, id: string) {
    return comTenant(tenantId, async (q) => {
      await q(`delete from knowledge_chunks where document_id=$1`, [id]);
      await q(`delete from knowledge_documents where id=$1`, [id]);
      return { ok: true };
    });
  }

  async buscar(q: QueryFn, projetoId: string, consulta: string, limit = 5) {
    const queryEmbedding = await this.embedOne(consulta).catch(() => null);
    if (queryEmbedding) {
      if (await pgvectorEnabled(q)) {
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
        `select kc.id, kd.titulo, kc.conteudo, kc.embedding, kc.chunk_index
         from knowledge_chunks kc
         join knowledge_documents kd on kd.id=kc.document_id
         where kd.status='ativo'
           and (kc.projeto_id is null or kc.projeto_id=$1)
           and kc.embedding is not null
         limit 500`,
        [projetoId],
      )).rows;
      return rows
        .map((row: any) => ({ ...row, score: cosine(queryEmbedding, row.embedding) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit)
        .map(({ embedding, ...row }: any) => row);
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

  private async embedOne(text: string): Promise<number[] | null> {
    const all = await this.embedMany([text]);
    return all?.[0] ?? null;
  }

  private async embedMany(texts: string[]): Promise<number[][] | null> {
    const apiKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!r.ok) throw new Error(`embedding ${r.status}: ${await r.text()}`);
    const d = await r.json() as any;
    return d.data?.map((item: any) => item.embedding) ?? null;
  }
}

export function chunkText(input: string) {
  const text = input.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(start + MAX_CHARS, text.length);
    const softEnd = text.lastIndexOf('\n\n', hardEnd);
    const end = softEnd > start + 600 ? softEnd : hardEnd;
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    const next = end - OVERLAP;
    start = next > start ? next : end;
  }
  return chunks.filter(Boolean);
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
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
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
