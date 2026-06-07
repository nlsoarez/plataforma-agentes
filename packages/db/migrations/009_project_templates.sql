-- Templates de projeto estilo Zatten: JSON importavel/exportavel.

create table if not exists project_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  nome        text not null,
  descricao   text,
  versao      int not null default 1,
  payload     jsonb not null,
  publico     boolean not null default false,
  origem      text not null default 'user',
  criado_em   timestamptz not null default now()
);

alter table project_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='project_templates' and policyname='tenant_isolation'
  ) then
    create policy tenant_isolation on project_templates
    using (tenant_id is null or tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;

create index if not exists project_templates_tenant_idx on project_templates (tenant_id, publico, criado_em);
