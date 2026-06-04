import { pool, comTenant } from '@plataforma/db';
import { hashSenha } from './auth/senha';

// Cria uma agência demo e um usuário owner. Rode: pnpm --filter @plataforma/api seed
async function main() {
  const dominio = process.env.SEED_DOMINIO ?? 'localhost:3001';
  const t = await pool.query(
    `insert into tenants (nome, dominio, status) values ($1,$2,'active')
     on conflict (dominio) do update set nome=excluded.nome returning id`,
    ['Agência Demo', dominio],
  );
  const tenantId = t.rows[0].id;

  await comTenant(tenantId, (q) =>
    q(`insert into usuarios (tenant_id, email, senha_hash, papel) values ($1,$2,$3,'owner')
       on conflict (tenant_id, email) do update set senha_hash=excluded.senha_hash`,
      [tenantId, 'admin@demo.com', hashSenha('senha123')]),
  );

  console.log(`seed ok -> tenant ${tenantId}`);
  console.log(`login: admin@demo.com / senha123  (dominio ${dominio})`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
