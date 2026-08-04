-- Corrige as policies para falharem fechadas quando o contexto nao existe.
-- A role de runtime deve ser diferente da dona das tabelas; a API/worker validam isso no startup.
do $$
declare
  v_table_name text;
begin
  for v_table_name in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity = true
       and a.attname = 'tenant_id'
       and not a.attisdropped
  loop
    if exists (
      select 1 from pg_policies
       where schemaname='public'
         and tablename=v_table_name
         and policyname='tenant_isolation'
    ) then
      execute format(
        'alter policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
        v_table_name
      );
    else
      execute format(
        'create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
        v_table_name
      );
    end if;
  end loop;
end $$;

-- Lookup global minimo para autenticar uma chave antes de conhecer o tenant.
-- A funcao e SECURITY DEFINER para que a role de runtime continue sujeita ao RLS nas demais queries.
create or replace function authenticate_api_key(p_key_hash text)
returns table(id uuid, tenant_id uuid, escopos text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update api_keys k
       set ultimo_uso_em=now()
     where k.key_hash=p_key_hash
       and k.ativo=true
    returning k.id, k.tenant_id, k.escopos;
end;
$$;

revoke all on function authenticate_api_key(text) from public;
