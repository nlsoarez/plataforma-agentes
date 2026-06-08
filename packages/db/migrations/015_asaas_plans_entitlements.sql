-- Planos, limites, addons e billing primario via Asaas.
-- Mantem compatibilidade com planos/assinaturas existentes.

alter table planos add column if not exists code text;
alter table planos add column if not exists description text;
alter table planos add column if not exists monthly_price_cents int;
alter table planos add column if not exists annual_price_cents int;
alter table planos add column if not exists currency text not null default 'BRL';
alter table planos add column if not exists is_public boolean not null default true;
alter table planos add column if not exists is_active boolean not null default true;
alter table planos add column if not exists display_order int not null default 100;
alter table planos add column if not exists metadata jsonb not null default '{}';
alter table planos add column if not exists updated_at timestamptz not null default now();

update planos
   set code = coalesce(code, lower(regexp_replace(nome, '[^a-zA-Z0-9]+', '_', 'g'))),
       monthly_price_cents = coalesce(monthly_price_cents, valor_centavos),
       annual_price_cents = coalesce(annual_price_cents, valor_centavos * 10),
       updated_at = now()
 where code is null
    or monthly_price_cents is null
    or annual_price_cents is null;

create unique index if not exists planos_code_unique
  on planos (code);

alter table assinaturas add column if not exists billing_cycle text not null default 'monthly';
alter table assinaturas add column if not exists trial_started_at timestamptz;
alter table assinaturas add column if not exists trial_ends_at timestamptz;
alter table assinaturas add column if not exists current_period_started_at timestamptz;
alter table assinaturas add column if not exists current_period_ends_at timestamptz;
alter table assinaturas add column if not exists grace_period_ends_at timestamptz;
alter table assinaturas add column if not exists canceled_at timestamptz;
alter table assinaturas add column if not exists cancel_at_period_end boolean not null default false;
alter table assinaturas add column if not exists external_customer_id text;
alter table assinaturas add column if not exists external_subscription_id text;
alter table assinaturas add column if not exists external_payment_id text;
alter table assinaturas add column if not exists migration_origin text;
alter table assinaturas add column if not exists metadata jsonb not null default '{}';

update assinaturas
   set external_customer_id = coalesce(external_customer_id, provider_customer_id),
       external_subscription_id = coalesce(external_subscription_id, provider_subscription_id),
       current_period_started_at = coalesce(current_period_started_at, criado_em),
       current_period_ends_at = coalesce(current_period_ends_at, criado_em + interval '1 month')
 where external_customer_id is null
    or external_subscription_id is null
    or current_period_started_at is null
    or current_period_ends_at is null;

create index if not exists assinaturas_tenant_status_idx
  on assinaturas (tenant_id, status, criado_em desc);
create index if not exists assinaturas_external_subscription_idx
  on assinaturas (provider, external_subscription_id)
  where external_subscription_id is not null;
create index if not exists assinaturas_external_payment_idx
  on assinaturas (provider, external_payment_id)
  where external_payment_id is not null;

create table if not exists plan_entitlements (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references planos(id) on delete cascade,
  feature_key    text not null,
  enabled        boolean not null default true,
  limit_value    bigint,
  limit_period   text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (plan_id, feature_key)
);

create table if not exists addons (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  description           text,
  unit_price_cents      int not null,
  billing_period        text not null default 'monthly',
  entitlement_key       text not null,
  entitlement_increment bigint not null,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists subscription_addons (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  subscription_id  uuid not null references assinaturas(id) on delete cascade,
  addon_code       text not null references addons(code),
  quantity         int not null default 1 check (quantity >= 0),
  unit_price_cents int not null,
  status           text not null default 'active',
  external_reference text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (subscription_id, addon_code)
);

create table if not exists usage_counters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  metric_key    text not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  current_value bigint not null default 0,
  updated_at    timestamptz not null default now(),
  unique (tenant_id, metric_key, period_start, period_end)
);

create table if not exists billing_events (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references tenants(id) on delete cascade,
  subscription_id     uuid references assinaturas(id) on delete set null,
  provider            text not null,
  external_event_id   text not null,
  event_type          text not null,
  payload             jsonb not null default '{}',
  processing_status   text not null default 'processed',
  processing_error    text,
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table if not exists invoices (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  subscription_id     uuid references assinaturas(id) on delete set null,
  provider            text not null default 'asaas',
  external_invoice_id text not null,
  amount_cents        int not null default 0,
  status              text not null default 'pending',
  due_date            date,
  paid_at             timestamptz,
  payment_method      text,
  invoice_url         text,
  pix_qr_code         text,
  boleto_url          text,
  payload             jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, external_invoice_id)
);

alter table subscription_addons enable row level security;
alter table usage_counters enable row level security;
alter table billing_events enable row level security;
alter table invoices enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'subscription_addons','usage_counters','billing_events','invoices'
  ]) loop
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

insert into planos
  (code, nome, description, valor_centavos, monthly_price_cents, annual_price_cents, ciclo, currency, display_order, metadata)
values
  ('start', 'Start', 'Operacao inicial com WhatsApp, agentes e CRM basico.', 5990, 5990, 59900, 'MONTHLY', 'BRL', 1, '{"popular": false}'::jsonb),
  ('pro', 'Pro', 'Plano recomendado para operacao comercial em crescimento.', 11990, 11990, 119900, 'MONTHLY', 'BRL', 2, '{"popular": true}'::jsonb),
  ('business', 'Business', 'Limites maiores para times, automacoes e campanhas.', 24990, 24990, 249900, 'MONTHLY', 'BRL', 3, '{"popular": false}'::jsonb),
  ('white_label', 'White-label', 'Plataforma white-label para agencias e operacoes avancadas.', 59790, 59790, 597900, 'MONTHLY', 'BRL', 4, '{"popular": false, "white_label": true}'::jsonb)
on conflict (code) do update set
  nome = excluded.nome,
  description = excluded.description,
  valor_centavos = excluded.valor_centavos,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = excluded.annual_price_cents,
  ciclo = excluded.ciclo,
  currency = excluded.currency,
  display_order = excluded.display_order,
  metadata = excluded.metadata,
  is_public = true,
  is_active = true,
  updated_at = now();

with entitlements(plan_code, feature_key, enabled, limit_value, limit_period, metadata) as (
  values
    ('start','projects',true,1,null,'{}'::jsonb),
    ('start','whatsapp_connections',true,1,null,'{}'::jsonb),
    ('start','team_users',true,2,null,'{}'::jsonb),
    ('start','ai_agents',true,1,null,'{}'::jsonb),
    ('start','contacts',true,1000,null,'{}'::jsonb),
    ('start','pipelines',true,1,null,'{}'::jsonb),
    ('start','pipeline_stages_per_pipeline',true,5,null,'{}'::jsonb),
    ('start','knowledge_documents',true,10,null,'{}'::jsonb),
    ('start','knowledge_document_size_bytes',true,26214400,null,'{}'::jsonb),
    ('start','storage_bytes',true,104857600,null,'{}'::jsonb),
    ('start','active_automations',true,3,null,'{}'::jsonb),
    ('start','campaigns',false,0,null,'{}'::jsonb),
    ('start','campaigns_monthly',false,0,'month','{}'::jsonb),
    ('start','campaign_recipients_monthly',false,0,'month','{}'::jsonb),
    ('start','public_api',false,0,null,'{}'::jsonb),
    ('start','public_api_keys',false,0,null,'{}'::jsonb),
    ('start','outbound_webhooks',false,0,null,'{}'::jsonb),
    ('start','white_label_branding',false,0,null,'{}'::jsonb),
    ('start','custom_domain',false,0,null,'{}'::jsonb),

    ('pro','projects',true,3,null,'{}'::jsonb),
    ('pro','whatsapp_connections',true,3,null,'{}'::jsonb),
    ('pro','team_users',true,5,null,'{}'::jsonb),
    ('pro','ai_agents',true,3,null,'{}'::jsonb),
    ('pro','contacts',true,10000,null,'{}'::jsonb),
    ('pro','pipelines',true,3,null,'{}'::jsonb),
    ('pro','pipeline_stages_per_pipeline',true,10,null,'{}'::jsonb),
    ('pro','knowledge_documents',true,100,null,'{}'::jsonb),
    ('pro','knowledge_document_size_bytes',true,52428800,null,'{}'::jsonb),
    ('pro','storage_bytes',true,1073741824,null,'{}'::jsonb),
    ('pro','active_automations',true,25,null,'{}'::jsonb),
    ('pro','campaigns',true,1,null,'{}'::jsonb),
    ('pro','campaigns_monthly',true,10,'month','{}'::jsonb),
    ('pro','campaign_recipients_monthly',true,10000,'month','{}'::jsonb),
    ('pro','public_api',false,0,null,'{}'::jsonb),
    ('pro','public_api_keys',false,0,null,'{}'::jsonb),
    ('pro','outbound_webhooks',true,3,null,'{}'::jsonb),
    ('pro','white_label_branding',false,0,null,'{}'::jsonb),
    ('pro','custom_domain',false,0,null,'{}'::jsonb),

    ('business','projects',true,10,null,'{}'::jsonb),
    ('business','whatsapp_connections',true,10,null,'{}'::jsonb),
    ('business','team_users',true,20,null,'{}'::jsonb),
    ('business','ai_agents',true,10,null,'{}'::jsonb),
    ('business','contacts',true,50000,null,'{}'::jsonb),
    ('business','pipelines',true,10,null,'{}'::jsonb),
    ('business','pipeline_stages_per_pipeline',true,20,null,'{}'::jsonb),
    ('business','knowledge_documents',true,500,null,'{}'::jsonb),
    ('business','knowledge_document_size_bytes',true,104857600,null,'{}'::jsonb),
    ('business','storage_bytes',true,5368709120,null,'{}'::jsonb),
    ('business','active_automations',true,100,null,'{}'::jsonb),
    ('business','campaigns',true,1,null,'{}'::jsonb),
    ('business','campaigns_monthly',true,50,'month','{}'::jsonb),
    ('business','campaign_recipients_monthly',true,50000,'month','{}'::jsonb),
    ('business','public_api',true,1,null,'{}'::jsonb),
    ('business','public_api_keys',true,10,null,'{}'::jsonb),
    ('business','outbound_webhooks',true,10,null,'{}'::jsonb),
    ('business','white_label_branding',false,0,null,'{}'::jsonb),
    ('business','custom_domain',false,0,null,'{}'::jsonb),

    ('white_label','projects',true,999999,null,'{}'::jsonb),
    ('white_label','whatsapp_connections',true,999999,null,'{}'::jsonb),
    ('white_label','team_users',true,999999,null,'{}'::jsonb),
    ('white_label','ai_agents',true,999999,null,'{}'::jsonb),
    ('white_label','contacts',true,999999999,null,'{}'::jsonb),
    ('white_label','pipelines',true,999999,null,'{}'::jsonb),
    ('white_label','pipeline_stages_per_pipeline',true,999999,null,'{}'::jsonb),
    ('white_label','knowledge_documents',true,999999,null,'{}'::jsonb),
    ('white_label','knowledge_document_size_bytes',true,157286400,null,'{}'::jsonb),
    ('white_label','storage_bytes',true,16106127360,null,'{}'::jsonb),
    ('white_label','active_automations',true,999999,null,'{}'::jsonb),
    ('white_label','campaigns',true,1,null,'{}'::jsonb),
    ('white_label','campaigns_monthly',true,999999,'month','{}'::jsonb),
    ('white_label','campaign_recipients_monthly',true,999999999,'month','{}'::jsonb),
    ('white_label','public_api',true,1,null,'{}'::jsonb),
    ('white_label','public_api_keys',true,999999,null,'{}'::jsonb),
    ('white_label','outbound_webhooks',true,999999,null,'{}'::jsonb),
    ('white_label','white_label_branding',true,1,null,'{}'::jsonb),
    ('white_label','custom_domain',true,1,null,'{}'::jsonb)
)
insert into plan_entitlements (plan_id, feature_key, enabled, limit_value, limit_period, metadata)
select p.id, e.feature_key, e.enabled, e.limit_value, e.limit_period, e.metadata
  from entitlements e
  join planos p on p.code = e.plan_code
on conflict (plan_id, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  limit_period = excluded.limit_period,
  metadata = excluded.metadata,
  updated_at = now();

insert into addons
  (code, name, description, unit_price_cents, entitlement_key, entitlement_increment)
values
  ('extra_project', 'Projeto extra', 'Adiciona 1 projeto ativo.', 4990, 'projects', 1),
  ('extra_whatsapp_connection', 'Conexao WhatsApp extra', 'Adiciona 1 conexao WhatsApp.', 3990, 'whatsapp_connections', 1),
  ('extra_user', 'Usuario extra', 'Adiciona 1 usuario de equipe.', 1490, 'team_users', 1),
  ('extra_ai_agent', 'Agente IA extra', 'Adiciona 1 agente de IA ativo.', 2490, 'ai_agents', 1),
  ('extra_5000_contacts', '5.000 contatos extras', 'Adiciona 5.000 contatos.', 2990, 'contacts', 5000),
  ('extra_5gb_storage', '5 GB de armazenamento extra', 'Adiciona 5 GB de armazenamento.', 2990, 'storage_bytes', 5368709120)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  unit_price_cents = excluded.unit_price_cents,
  entitlement_key = excluded.entitlement_key,
  entitlement_increment = excluded.entitlement_increment,
  active = true,
  updated_at = now();

insert into assinaturas
  (tenant_id, plano_id, provider, status, qtd_projetos, billing_cycle,
   trial_started_at, trial_ends_at, current_period_started_at, current_period_ends_at,
   migration_origin, metadata)
select t.id, p.id, 'migration', 'trialing',
       greatest(coalesce(px.qtd, 0), 1), 'monthly',
       now(), now() + interval '7 days', now(), now() + interval '7 days',
       'trial_pro_migration',
       jsonb_build_object('migrated_at', now())
  from tenants t
  cross join planos p
  left join (
    select tenant_id, count(*)::int as qtd
      from projetos
     where status = 'ativo'
     group by tenant_id
  ) px on px.tenant_id = t.id
 where p.code = 'pro'
   and not exists (
     select 1 from assinaturas a where a.tenant_id = t.id
   );

create or replace function resolver_assinatura_provider(p_provider text, p_external_id text)
returns table(id uuid, tenant_id uuid)
language sql security definer set search_path = public as $$
  select a.id, a.tenant_id
    from assinaturas a
   where a.provider = p_provider
     and (
       a.external_subscription_id = p_external_id
       or a.external_payment_id = p_external_id
       or a.provider_subscription_id = p_external_id
     )
   order by a.criado_em desc
   limit 1;
$$;
