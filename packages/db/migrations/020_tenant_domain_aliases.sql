begin;

create table if not exists tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  domain text not null,
  kind text not null default 'alias' check (kind in ('primary', 'alias', 'system')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_domain_unique unique (domain)
);

create index if not exists tenant_domains_tenant_id_idx on tenant_domains (tenant_id);
create index if not exists tenant_domains_domain_lower_idx on tenant_domains (lower(domain));

insert into tenant_domains (tenant_id, domain, kind, verified_at)
select id, lower(trim(dominio)), 'primary', now()
from tenants
where nullif(trim(dominio), '') is not null
on conflict (domain) do nothing;

commit;
