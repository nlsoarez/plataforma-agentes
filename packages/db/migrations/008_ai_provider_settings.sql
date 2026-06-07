-- Configuracao de IA por tenant/projeto: chave BYOK criptografada e custos.

create table if not exists ai_provider_settings (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,
  provider                text not null default 'openai',
  nome                    text not null default 'OpenAI',
  encrypted_api_key       text,
  key_last4               text,
  default_model           text not null default 'gpt-4o-mini',
  embedding_model         text not null default 'text-embedding-3-small',
  input_cost_per_1m       numeric(12,6) not null default 0,
  output_cost_per_1m      numeric(12,6) not null default 0,
  embedding_cost_per_1m   numeric(12,6) not null default 0,
  currency                text not null default 'USD',
  ativo                   boolean not null default true,
  atualizado_em           timestamptz not null default now(),
  criado_em               timestamptz not null default now(),
  unique (tenant_id, provider)
);

alter table agentes add column if not exists ai_provider_setting_id uuid references ai_provider_settings(id);

alter table ai_provider_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='ai_provider_settings' and policyname='tenant_isolation'
  ) then
    create policy tenant_isolation on ai_provider_settings
    using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists ai_provider_settings_tenant_idx on ai_provider_settings (tenant_id, provider, ativo);
