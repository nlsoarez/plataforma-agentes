alter table calendar_integrations
  add column if not exists calendars_cache jsonb not null default '[]'::jsonb,
  add column if not exists calendars_cache_at timestamptz;

alter table contatos
  add column if not exists opt_out_whatsapp boolean not null default false,
  add column if not exists opt_out_reason text,
  add column if not exists opt_out_at timestamptz;

create index if not exists contatos_opt_out_whatsapp_idx
  on contatos (tenant_id, projeto_id, opt_out_whatsapp);
