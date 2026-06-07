-- Hardening do fluxo principal Evolution -> worker -> agente -> inbox.

alter table projetos add column if not exists last_error text;
alter table projetos add column if not exists last_error_at timestamptz;

create table if not exists eventos_operacionais (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  projeto_id  uuid references projetos(id) on delete cascade,
  origem      text not null,
  nivel       text not null default 'info',
  evento      text not null,
  mensagem    text not null,
  payload     jsonb not null default '{}',
  criado_em   timestamptz not null default now()
);

alter table eventos_operacionais enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'eventos_operacionais'
      and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on eventos_operacionais
      using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists eventos_operacionais_tenant_idx
  on eventos_operacionais (tenant_id, criado_em desc);

create unique index if not exists mensagens_tenant_meta_message_id_uniq
  on mensagens (tenant_id, meta_message_id)
  where meta_message_id is not null;

-- Uma instancia conectada deve rotear mensagem mesmo que o status textual ainda
-- esteja atrasado por causa de webhook/polling fora de ordem.
create or replace function resolver_projeto(p_phone text)
returns table(tenant_id uuid, projeto_id uuid)
language sql
security definer
set search_path = public
as $$
  select tenant_id, id
  from projetos
  where phone_number_id = p_phone
    and (status = 'ativo' or connection_state = 'open')
  limit 1;
$$;
