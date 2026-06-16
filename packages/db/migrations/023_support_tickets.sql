create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  usuario_id  uuid references usuarios(id) on delete set null,
  topic       text not null,
  subject     text not null,
  description text not null,
  status      text not null default 'open',
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

alter table support_tickets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'support_tickets'
      and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on support_tickets
      using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists support_tickets_tenant_status_idx
  on support_tickets (tenant_id, status, created_at desc);

create index if not exists support_tickets_user_idx
  on support_tickets (usuario_id, created_at desc);
