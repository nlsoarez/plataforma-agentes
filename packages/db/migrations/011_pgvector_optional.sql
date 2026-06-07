-- Pgvector opcional para RAG. Se a extensao nao existir no Postgres atual,
-- a migration continua e o app usa o fallback JSONB/textual.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    execute 'create extension if not exists vector';

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='knowledge_chunks'
        and column_name='embedding_vector'
    ) then
      execute 'alter table knowledge_chunks add column embedding_vector vector(1536)';
    end if;

    execute $sql$
      update knowledge_chunks
      set embedding_vector = embedding::text::vector
      where embedding is not null
        and embedding_vector is null
        and jsonb_array_length(embedding) = 1536
    $sql$;

    execute $sql$
      create index if not exists knowledge_chunks_embedding_vector_idx
      on knowledge_chunks using ivfflat (embedding_vector vector_cosine_ops)
      with (lists = 100)
      where embedding_vector is not null
    $sql$;
  end if;
end $$;
