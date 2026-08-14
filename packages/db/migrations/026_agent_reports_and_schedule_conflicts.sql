alter table agendamentos
  add column if not exists fim_em timestamptz,
  add column if not exists duracao_minutos int not null default 60;

update agendamentos
   set fim_em = inicio_em + make_interval(mins => greatest(15, duracao_minutos))
 where fim_em is null;

create index if not exists agendamentos_tenant_projeto_periodo_idx
  on agendamentos (tenant_id, projeto_id, inicio_em, fim_em);

create table if not exists agent_report_settings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  projeto_id      uuid not null references projetos(id) on delete cascade,
  ativo           boolean not null default false,
  horario         time not null default '18:00',
  timezone        text not null default 'America/Sao_Paulo',
  canal           text not null default 'whatsapp',
  destino         text not null default '',
  escopo          text not null default 'diario',
  ultimo_envio_em timestamptz,
  ultimo_erro     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (tenant_id, projeto_id),
  check (canal in ('whatsapp', 'email')),
  check (escopo in ('diario'))
);

create table if not exists agent_report_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  projeto_id     uuid not null references projetos(id) on delete cascade,
  setting_id     uuid references agent_report_settings(id) on delete set null,
  periodo_inicio timestamptz not null,
  periodo_fim    timestamptz not null,
  canal          text not null,
  destino        text not null,
  conteudo       text not null default '',
  status         text not null default 'pendente',
  erro           text,
  enviado_em     timestamptz,
  criado_em      timestamptz not null default now(),
  check (canal in ('whatsapp', 'email')),
  check (status in ('pendente', 'enviado', 'falha'))
);

alter table agent_report_settings enable row level security;
alter table agent_report_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = current_schema()
       and tablename = 'agent_report_settings'
       and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on agent_report_settings
      using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = current_schema()
       and tablename = 'agent_report_runs'
       and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on agent_report_runs
      using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists agent_report_settings_due_idx
  on agent_report_settings (ativo, horario);

create index if not exists agent_report_runs_projeto_criado_idx
  on agent_report_runs (tenant_id, projeto_id, criado_em desc);
