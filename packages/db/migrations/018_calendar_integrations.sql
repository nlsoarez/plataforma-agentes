-- Integracao Google Calendar por tenant/usuario.
-- Cada cliente conecta a propria conta Google; tokens ficam criptografados.

create table if not exists calendar_integrations (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  usuario_id               uuid references usuarios(id) on delete set null,
  provider                 text not null default 'google',
  account_email            text,
  calendar_id              text not null default 'primary',
  encrypted_access_token   text,
  encrypted_refresh_token  text not null,
  token_expires_at         timestamptz,
  scopes                   text[] not null default '{}',
  ativo                    boolean not null default true,
  last_sync_at             timestamptz,
  last_error               text,
  metadata                 jsonb not null default '{}',
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

alter table calendar_integrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='calendar_integrations'
      and policyname='tenant_isolation'
  ) then
    create policy tenant_isolation on calendar_integrations
    using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create unique index if not exists calendar_integrations_one_active_google
  on calendar_integrations (tenant_id, provider)
  where ativo=true;

create index if not exists calendar_integrations_tenant_idx
  on calendar_integrations (tenant_id, ativo);
