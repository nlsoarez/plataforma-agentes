-- Resolve o projeto pelo phone_number_id ANTES de saber o tenant.
-- SECURITY DEFINER: roda como dono da função (que ignora o RLS), então
-- conseguimos descobrir o tenant a partir do número que recebeu a mensagem.
-- Retorna só o roteamento — nada de dados sensíveis de outro tenant.
create or replace function resolver_projeto(p_phone text)
returns table(tenant_id uuid, projeto_id uuid)
language sql
security definer
set search_path = public
as $$
  select tenant_id, id
  from projetos
  where phone_number_id = p_phone and status = 'ativo'
  limit 1;
$$;

-- Permite upsert de contato por (projeto, telefone).
alter table contatos
  add constraint contatos_projeto_telefone_uniq unique (projeto_id, telefone);
