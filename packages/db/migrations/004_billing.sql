-- Planos (global, sem RLS) — preço por projeto.
create table if not exists planos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  valor_centavos int not null,
  ciclo         text not null default 'MONTHLY'
);
insert into planos (nome, valor_centavos)
select 'Projeto', 36900 where not exists (select 1 from planos);

-- Assinatura por tenant (quantidade = nº de projetos ativos).
create table if not exists assinaturas (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id) on delete cascade,
  plano_id                  uuid references planos(id),
  provider                  text,
  provider_customer_id      text,
  provider_subscription_id  text,
  status                    text not null default 'pendente', -- pendente|ativa|inadimplente|cancelada
  qtd_projetos              int not null default 1,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
alter table assinaturas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='assinaturas' and policyname='tenant_isolation') then
    create policy tenant_isolation on assinaturas using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;
create index if not exists idx_assinaturas_sub on assinaturas (provider_subscription_id);

-- Resolve a assinatura pelo id do provider (webhook não tem tenant) — bypassa RLS.
create or replace function resolver_assinatura(p_sub text)
returns table(id uuid, tenant_id uuid)
language sql security definer set search_path = public as $$
  select id, tenant_id from assinaturas where provider_subscription_id = p_sub limit 1;
$$;
