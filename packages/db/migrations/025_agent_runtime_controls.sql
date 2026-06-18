alter table agentes add column if not exists horario_ativo boolean not null default false;
alter table agentes add column if not exists horario_inicio time;
alter table agentes add column if not exists horario_fim time;
alter table agentes add column if not exists horario_timezone text not null default 'America/Sao_Paulo';
