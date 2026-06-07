-- RAG basico: documentos quebrados em chunks com embedding opcional.

alter table knowledge_documents add column if not exists metadata jsonb not null default '{}';
alter table knowledge_documents add column if not exists chunk_count int not null default 0;
alter table knowledge_documents add column if not exists embedding_model text;
alter table knowledge_documents add column if not exists indexado_em timestamptz;

create table if not exists knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  document_id   uuid not null references knowledge_documents(id) on delete cascade,
  projeto_id    uuid references projetos(id) on delete cascade,
  chunk_index   int not null,
  conteudo      text not null,
  token_est     int not null default 0,
  embedding     jsonb,
  metadata      jsonb not null default '{}',
  criado_em     timestamptz not null default now(),
  unique (document_id, chunk_index)
);

alter table knowledge_chunks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='knowledge_chunks' and policyname='tenant_isolation'
  ) then
    create policy tenant_isolation on knowledge_chunks
    using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists knowledge_chunks_doc_idx on knowledge_chunks (tenant_id, document_id, chunk_index);
create index if not exists knowledge_chunks_project_idx on knowledge_chunks (tenant_id, projeto_id);
create index if not exists knowledge_chunks_fts_idx on knowledge_chunks
  using gin (to_tsvector('portuguese', conteudo));
