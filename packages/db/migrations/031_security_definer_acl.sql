-- SECURITY DEFINER functions intentionally bypass tenant RLS for narrowly scoped
-- webhook/routing lookups. They must never inherit PostgreSQL's default PUBLIC
-- EXECUTE privilege. The runtime role receives an explicit grant from the
-- provision-runtime-role step.
revoke all on function resolver_projeto(text) from public;
revoke all on function resolver_assinatura(text) from public;
revoke all on function resolver_assinatura_provider(text, text) from public;

