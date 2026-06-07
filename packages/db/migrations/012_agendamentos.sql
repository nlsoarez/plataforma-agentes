-- Agenda criada por tool do agente. Integracao externa pode ser feita por
-- webhook configurado, sem fingir Google Calendar quando OAuth nao existe.

create table if not exists agendamentos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  projeto_id     uuid not null references projetos(id) on delete cascade,
  conversa_id    uuid references conversas(id) on delete set null,
  contato_id     uuid references contatos(id) on delete set null,
  inicio_em      timestamptz not null,
  descricao      text,
  status         text not null default 'pendente',
  provider       text,
  provider_ref   text,
  erro           text,
  metadata       jsonb not null default '{}',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table agendamentos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='agendamentos'
      and policyname='tenant_isolation'
  ) then
    create policy tenant_isolation on agendamentos
    using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists agendamentos_tenant_inicio_idx on agendamentos (tenant_id, inicio_em desc);
create index if not exists agendamentos_contato_idx on agendamentos (tenant_id, contato_id, inicio_em desc);
