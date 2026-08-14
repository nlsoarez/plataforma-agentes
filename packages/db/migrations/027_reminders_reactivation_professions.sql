alter table agendamentos
  add column if not exists confirmation_status text not null default 'pendente',
  add column if not exists reminder_status text not null default 'pendente',
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reschedule_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'agendamentos_confirmation_status_chk'
  ) then
    alter table agendamentos
      add constraint agendamentos_confirmation_status_chk
      check (confirmation_status in ('pendente', 'aguardando', 'confirmado', 'remarcando', 'cancelado'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'agendamentos_reminder_status_chk'
  ) then
    alter table agendamentos
      add constraint agendamentos_reminder_status_chk
      check (reminder_status in ('pendente', 'enviado', 'falha', 'dispensado'));
  end if;
end $$;

create table if not exists appointment_reminder_settings (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  projeto_id       uuid not null references projetos(id) on delete cascade,
  ativo            boolean not null default true,
  antecedencia_horas int not null default 24,
  horario_inicio   time not null default '09:00',
  horario_fim      time not null default '18:00',
  timezone         text not null default 'America/Sao_Paulo',
  mensagem         text not null default 'Ola, confirmando seu atendimento em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.',
  ultimo_erro      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (tenant_id, projeto_id),
  check (antecedencia_horas between 1 and 168)
);

create table if not exists appointment_reminders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  projeto_id      uuid not null references projetos(id) on delete cascade,
  agendamento_id  uuid not null references agendamentos(id) on delete cascade,
  contato_id      uuid references contatos(id) on delete set null,
  phone_number_id text not null,
  scheduled_for   timestamptz not null,
  sent_at         timestamptz,
  status          text not null default 'pendente',
  message         text not null default '',
  error           text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (agendamento_id),
  check (status in ('pendente', 'enviado', 'falha', 'cancelado'))
);

create table if not exists lead_reactivation_settings (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  projeto_id       uuid not null references projetos(id) on delete cascade,
  ativo            boolean not null default false,
  dias_inatividade int not null default 60,
  horario          time not null default '10:00',
  timezone         text not null default 'America/Sao_Paulo',
  limite_diario    int not null default 30,
  janela_reenvio_dias int not null default 30,
  mensagem         text not null default 'Ola, {{nome}}. Passando para saber se deseja retomar seu atendimento ou agendar um novo horario.',
  ultimo_envio_em  timestamptz,
  ultimo_erro      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (tenant_id, projeto_id),
  check (dias_inatividade between 7 and 730),
  check (limite_diario between 1 and 500),
  check (janela_reenvio_dias between 1 and 365)
);

create table if not exists lead_reactivation_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  projeto_id      uuid not null references projetos(id) on delete cascade,
  setting_id      uuid references lead_reactivation_settings(id) on delete set null,
  contato_id      uuid not null references contatos(id) on delete cascade,
  phone_number_id text not null,
  message         text not null default '',
  status          text not null default 'pendente',
  error           text,
  sent_at         timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  check (status in ('pendente', 'enviado', 'falha', 'cancelado'))
);

alter table appointment_reminder_settings enable row level security;
alter table appointment_reminders enable row level security;
alter table lead_reactivation_settings enable row level security;
alter table lead_reactivation_runs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointment_reminder_settings',
    'appointment_reminders',
    'lead_reactivation_settings',
    'lead_reactivation_runs'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = current_schema()
         and tablename = t
         and policyname = 'tenant_isolation'
    ) then
      execute format(
        'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
        t
      );
    end if;
  end loop;
end $$;

create index if not exists agendamentos_reminder_due_idx
  on agendamentos (tenant_id, projeto_id, inicio_em, reminder_status, confirmation_status)
  where status in ('pendente', 'sincronizado');

create index if not exists appointment_reminders_due_idx
  on appointment_reminders (tenant_id, scheduled_for, status);

create index if not exists lead_reactivation_settings_due_idx
  on lead_reactivation_settings (ativo, horario);

create index if not exists lead_reactivation_runs_recent_idx
  on lead_reactivation_runs (tenant_id, projeto_id, contato_id, criado_em desc);
