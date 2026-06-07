-- Nucleo estilo Zatten com Evolution API:
-- sessoes, CRM enriquecido, API publica, webhooks outbound, conhecimento e automacoes.

alter table projetos add column if not exists connection_state text not null default 'unknown';
alter table projetos add column if not exists last_connection_update timestamptz;
alter table projetos add column if not exists session_meta jsonb not null default '{}';

alter table contatos add column if not exists notes text;
alter table contatos add column if not exists metadata jsonb not null default '{}';
alter table contatos add column if not exists unread_messages int not null default 0;
alter table contatos add column if not exists ai_response_block_until timestamptz;
alter table contatos add column if not exists ultima_interacao timestamptz;

create table if not exists departamentos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  nome        text not null,
  descricao   text,
  criado_em   timestamptz not null default now()
);

alter table usuarios
  add constraint usuarios_departamento_fk
  foreign key (departamento_id) references departamentos(id) on delete set null
  not valid;

alter table contatos add column if not exists departamento_id uuid references departamentos(id);

create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  nome        text not null,
  descricao   text,
  cor         text not null default '#6D3DF5',
  criado_em   timestamptz not null default now(),
  unique (tenant_id, nome)
);

create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  nome          text not null,
  key_hash      text not null unique,
  prefixo       text not null,
  escopos       text[] not null default array['messages','leads','kanban','tags'],
  ultimo_uso_em timestamptz,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table if not exists webhook_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  nome        text not null,
  url         text not null,
  secret      text,
  eventos     text[] not null default array['LEAD_CREATED','LEAD_INTERACTION','AI_RESPONSE','LEAD_KANBAN_UPDATED','LEAD_TAG_ADDED','LEAD_TAG_REMOVED','ERROR'],
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references webhook_subscriptions(id) on delete set null,
  evento          text not null,
  payload         jsonb not null,
  status          text not null default 'pendente',
  status_code     int,
  erro            text,
  tentativas      int not null default 0,
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz
);

create table if not exists knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  projeto_id  uuid references projetos(id) on delete cascade,
  titulo      text not null,
  tipo        text not null default 'text',
  conteudo    text not null,
  status      text not null default 'ativo',
  criado_em   timestamptz not null default now()
);

create table if not exists automacoes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  projeto_id  uuid references projetos(id) on delete cascade,
  nome        text not null,
  gatilho     text not null,
  condicoes   jsonb not null default '{}',
  acoes       jsonb not null default '[]',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists automacao_execucoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  automacao_id  uuid references automacoes(id) on delete set null,
  contato_id    uuid references contatos(id) on delete cascade,
  conversa_id   uuid references conversas(id) on delete cascade,
  status        text not null default 'executada',
  resultado     jsonb not null default '{}',
  criada_em     timestamptz not null default now()
);

alter table departamentos enable row level security;
alter table tags enable row level security;
alter table api_keys enable row level security;
alter table webhook_subscriptions enable row level security;
alter table webhook_deliveries enable row level security;
alter table knowledge_documents enable row level security;
alter table automacoes enable row level security;
alter table automacao_execucoes enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'departamentos','tags','api_keys','webhook_subscriptions','webhook_deliveries',
    'knowledge_documents','automacoes','automacao_execucoes'
  ]) loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation'
    ) then
      execute format($f$
        create policy tenant_isolation on %I
        using (tenant_id = current_setting('app.tenant_id', true)::uuid);
      $f$, t);
    end if;
  end loop;
end $$;

create index if not exists projetos_connection_state_idx on projetos (tenant_id, connection_state);
create index if not exists contatos_projeto_telefone_idx on contatos (projeto_id, telefone);
create index if not exists contatos_tags_idx on contatos using gin (tags);
create index if not exists contatos_metadata_idx on contatos using gin (metadata);
create index if not exists knowledge_documents_projeto_idx on knowledge_documents (tenant_id, projeto_id, status);
create index if not exists automacoes_gatilho_idx on automacoes (tenant_id, projeto_id, gatilho, ativo);
create index if not exists webhook_deliveries_status_idx on webhook_deliveries (tenant_id, status, criado_em);
