-- Camada administrativa e suporte basico a midia recebida.

alter table tenants add column if not exists custom_css text;
alter table tenants add column if not exists support_email text;
alter table tenants add column if not exists updated_at timestamptz not null default now();

alter table usuarios add column if not exists nome text;
alter table usuarios add column if not exists status text not null default 'ativo';
alter table usuarios add column if not exists ultimo_login_em timestamptz;

alter table mensagens add column if not exists midia_tipo text;
alter table mensagens add column if not exists midia_url text;
alter table mensagens add column if not exists midia_mime text;
alter table mensagens add column if not exists midia_meta jsonb not null default '{}';

create index if not exists usuarios_tenant_status_idx on usuarios (tenant_id, status);
create index if not exists departamentos_tenant_nome_idx on departamentos (tenant_id, nome);
create index if not exists mensagens_midia_idx on mensagens (tenant_id, midia_tipo) where midia_tipo is not null;
