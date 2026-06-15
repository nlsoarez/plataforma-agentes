alter table usuarios add column if not exists telefone text;
alter table usuarios add column if not exists cargo text;
alter table usuarios add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table usuarios add column if not exists locale text not null default 'pt-BR';
alter table usuarios add column if not exists preferencias jsonb not null default '{}';
alter table usuarios add column if not exists atualizado_em timestamptz;

create index if not exists usuarios_tenant_email_idx on usuarios (tenant_id, lower(email));
