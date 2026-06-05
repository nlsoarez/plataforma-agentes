-- Lead vindo de anúncio Click-to-WhatsApp guarda o clid pra devolver conversão.
alter table contatos add column if not exists ctwa_clid text;

-- Campanhas (ficou de fora da 001). Cria se não existir.
create table if not exists campanhas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  projeto_id    uuid not null references projetos(id) on delete cascade,
  template_nome text,
  segmento      jsonb not null default '{}',
  status        text not null default 'rascunho',
  criada_em     timestamptz not null default now()
);
alter table campanhas add column if not exists idioma text not null default 'pt_BR';

-- Status por contato dentro de uma campanha.
create table if not exists campanha_envios (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  campanha_id     uuid not null references campanhas(id) on delete cascade,
  contato_id      uuid not null references contatos(id) on delete cascade,
  meta_message_id text,
  status          text not null default 'enfileirado',
  criado_em       timestamptz not null default now()
);
create index if not exists idx_envios_meta on campanha_envios (meta_message_id);

-- RLS em campanhas e campanha_envios.
alter table campanhas enable row level security;
alter table campanha_envios enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='campanhas' and policyname='tenant_isolation') then
    create policy tenant_isolation on campanhas using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where tablename='campanha_envios' and policyname='tenant_isolation') then
    create policy tenant_isolation on campanha_envios using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;
