import { pool, comTenant, carregarEnv } from '@plataforma/db';
import { hashSenha } from './auth/senha';

carregarEnv(); // carrega .env antes de conectar

// Cria uma agência demo COMPLETA pra testar tudo localmente sem o fluxo da Meta.
// Rode: pnpm --filter @plataforma/api seed
async function main() {
  const dominio = process.env.SEED_DOMINIO ?? 'localhost:3001';
  const tenantNome = process.env.SEED_TENANT_NAME ?? 'Agência Demo';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'senha123';
  const demoData = process.env.SEED_DEMO_DATA !== 'false';
  const dominioNormalizado = dominio.trim().toLowerCase();
  const aliasesConfigurados = (process.env.SEED_DOMINIO_ALIASES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const aliasesInferidos = dominioNormalizado.startsWith('app.')
    ? [dominioNormalizado.slice(4)]
    : [];
  const dominiosTenant = [...new Set([dominioNormalizado, ...aliasesInferidos, ...aliasesConfigurados])];

  if (process.env.SEED_ADMIN_PASSWORD && adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 12 caracteres');
  }

  const t = await pool.query(
    `insert into tenants (nome, dominio, status) values ($1,$2,'active')
     on conflict (dominio) do update set nome=excluded.nome returning id`,
    [tenantNome, dominio],
  );
  const tenantId = t.rows[0].id;

  // As migrations rodam antes do seed em um banco novo. Portanto, a migration
  // que copia tenants existentes para tenant_domains ainda nao enxerga este
  // tenant. Sincronize o dominio principal e aliases aqui para que login,
  // OAuth e recuperacao de senha funcionem logo no primeiro deploy.
  await pool.query(
    `insert into tenant_domains (tenant_id, domain, kind, verified_at)
     select $1, d.domain, case when d.domain=$2 then 'primary' else 'alias' end, now()
       from unnest($3::text[]) as d(domain)
     on conflict (domain) do update
       set tenant_id=excluded.tenant_id,
           kind=excluded.kind,
           verified_at=excluded.verified_at,
           updated_at=now()`,
    [tenantId, dominioNormalizado, dominiosTenant],
  );

  await comTenant(tenantId, async (q) => {
    await q(`insert into usuarios (tenant_id, email, senha_hash, papel) values ($1,$2,$3,'owner')
             on conflict (tenant_id, email) do update set senha_hash=excluded.senha_hash`,
      [tenantId, adminEmail, hashSenha(adminPassword)]);

    if (!demoData) return;

    const proj = await q(
      `insert into projetos (tenant_id, nome, phone_number_id, status, transporte_driver)
       values ($1,'Projeto Demo','DEMO_PHONE_1','ativo','cloud_api')
       on conflict (phone_number_id) do update set nome=excluded.nome returning id`,
      [tenantId]);
    const projetoId = proj.rows[0].id;

    await q(`insert into agentes (tenant_id, projeto_id, prompt_sistema, modelo, provider, byok_key_ref, status)
             select $1,$2,'Voce e um atendente simpatico e objetivo.','gpt-4o-mini','openai','OPENAI_KEY_DEMO','ativo'
             where not exists (select 1 from agentes where projeto_id=$2)`,
      [tenantId, projetoId]);

    await q(`insert into etapas_pipeline (tenant_id, projeto_id, nome, ordem)
             select $1,$2,e.nome,e.ordem from (values ('Novo',0),('Qualificado',1),('Agendado',2),('Fechado',3)) as e(nome,ordem)
             where not exists (select 1 from etapas_pipeline where projeto_id=$2)`,
      [tenantId, projetoId]);

    await q(`insert into contatos (tenant_id, projeto_id, nome, telefone, etapa_pipeline)
             select $1,$2,c.nome,c.tel,(select id from etapas_pipeline where projeto_id=$2 and nome='Novo' limit 1)
             from (values ('Maria Souza','5521999990001'),('Joao Lima','5521999990002')) as c(nome,tel)
             where not exists (select 1 from contatos where projeto_id=$2)`,
      [tenantId, projetoId]);

    console.log(`projeto demo ${projetoId} criado (phone_number_id=DEMO_PHONE_1)`);
  });

  console.log(`seed ok -> tenant ${tenantId}`);
  console.log(`login criado para ${adminEmail} (dominio ${dominio})`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
