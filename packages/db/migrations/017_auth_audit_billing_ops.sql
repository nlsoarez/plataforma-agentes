alter table usuarios add column if not exists email_verified_at timestamptz;
alter table usuarios add column if not exists ultimo_reset_senha_em timestamptz;

create table if not exists auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  tipo        text not null,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, tipo, token_hash)
);

create table if not exists audit_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  usuario_id  uuid references usuarios(id) on delete set null,
  event_type  text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table auth_tokens enable row level security;
alter table audit_events enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['auth_tokens','audit_events']) loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation'
    ) then
      execute format($f$
        create policy tenant_isolation on %I
        using (tenant_id = current_setting('app.tenant_id', true)::uuid);
      $f$, t);
    end if;
  end loop;
end $$;

create index if not exists auth_tokens_lookup_idx
  on auth_tokens (tenant_id, tipo, token_hash, expires_at)
  where used_at is null;

create index if not exists audit_events_tenant_created_idx
  on audit_events (tenant_id, created_at desc);
