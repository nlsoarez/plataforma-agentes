-- Lead vindo de anúncio Click-to-WhatsApp guarda o clid pra devolver conversão.
alter table contatos add column if not exists ctwa_clid text;

alter table campanhas add column if not exists idioma text not null default 'pt_BR';

-- Status por contato dentro de uma campanha (entregue/lido/respondido por destinatário).
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

-- Correção: campanhas e campanha_envios precisam de RLS (faltou na 001).
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
