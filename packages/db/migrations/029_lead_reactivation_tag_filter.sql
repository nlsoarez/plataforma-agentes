begin;

alter table lead_reactivation_settings
  add column if not exists tag_filter text[] not null default '{}';

create index if not exists lead_reactivation_settings_tag_filter_idx
  on lead_reactivation_settings using gin (tag_filter);

commit;
