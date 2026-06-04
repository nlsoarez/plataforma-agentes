-- Migration inicial: núcleo multi-tenant com Row-Level Security.
-- Toda tabela de negócio carrega tenant_id e é protegida por RLS.

create extension if not exists "pgcrypto";

create table tenants (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  dominio       text unique not null,
  logo_url      text,
  cor_primaria  text,
  favicon_url   text,
  plano         text not null default 'trial',
  status        text not null default 'trial',
  criado_em     timestamptz not null default now()
);

create table usuarios (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  email           text not null,
  senha_hash      text not null,          -- PBKDF2-SHA256
  papel           text not null default 'cliente_final',
  departamento_id uuid,
  criado_em       timestamptz not null default now(),
  unique (tenant_id, email)
);

create table projetos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  nome              text not null,
  waba_id           text,
  phone_number_id   text unique,          -- chave de roteamento do webhook
  status            text not null default 'onboarding',
  transporte_driver text not null default 'cloud_api',
  criado_em         timestamptz not null default now()
);

create table agentes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  projeto_id        uuid not null references projetos(id) on delete cascade,
  prompt_sistema    text not null default '',
  modelo            text not null,
  provider          text not null,        -- openai | anthropic | google
  byok_key_ref      text,                 -- referência ao cofre, NUNCA a chave
  funcoes           jsonb not null default '[]',
  status            text not null default 'ativo'
);

create table etapas_pipeline (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  projeto_id  uuid not null references projetos(id) on delete cascade,
  nome        text not null,
  ordem       int not null default 0
);

create table contatos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  projeto_id     uuid not null references projetos(id) on delete cascade,
  nome           text,
  telefone       text not null,
  tags           text[] not null default '{}',
  etapa_pipeline uuid references etapas_pipeline(id),
  responsavel_id uuid references usuarios(id),
  origem         text,
  criado_em      timestamptz not null default now()
);

create table conversas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  projeto_id    uuid not null references projetos(id) on delete cascade,
  contato_id    uuid not null references contatos(id) on delete cascade,
  ia_pausada    boolean not null default false,   -- true quando humano assume
  status        text not null default 'aberta',
  atualizada_em timestamptz not null default now()
);

create table mensagens (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  conversa_id     uuid not null references conversas(id) on delete cascade,
  direcao         text not null,          -- inbound | outbound
  autor           text not null,          -- ia | humano | contato | sistema
  conteudo        text not null,
  meta_message_id text,
  tokens_in       int,
  tokens_out      int,
  status_entrega  text,
  criada_em       timestamptz not null default now()
);

create table acoes_ia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade,
  funcao      text not null,              -- mover_card | agendar | taguear | handoff
  argumentos  jsonb not null default '{}',
  resultado   jsonb,
  criada_em   timestamptz not null default now()
);

-- ---- Row-Level Security ----
-- A aplicação seta `set app.tenant_id = '<uuid>'` por requisição;
-- o Postgres garante que ninguém enxergue dados de outro tenant.
do $$
declare t text;
begin
  for t in select unnest(array[
    'usuarios','projetos','agentes','etapas_pipeline',
    'contatos','conversas','mensagens','acoes_ia'
  ]) loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$
      create policy tenant_isolation on %I
      using (tenant_id = current_setting('app.tenant_id', true)::uuid);
    $f$, t);
  end loop;
end $$;

create index on projetos (phone_number_id);
create index on conversas (tenant_id, status);
create index on mensagens (conversa_id, criada_em);
