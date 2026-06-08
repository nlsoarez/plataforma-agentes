-- Vinculo opcional de usuarios locais com contas Google.
-- O acesso continua condicionado a existir um usuario no tenant.

alter table usuarios add column if not exists google_sub text;
alter table usuarios add column if not exists nome text;
alter table usuarios add column if not exists avatar_url text;
alter table usuarios add column if not exists auth_provider text not null default 'password';
alter table usuarios add column if not exists ultimo_login_em timestamptz;

create unique index if not exists usuarios_tenant_google_sub_unique
  on usuarios (tenant_id, google_sub)
  where google_sub is not null;
