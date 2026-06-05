import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pool, carregarEnv } from './src/index';

carregarEnv(); // carrega .env ANTES de qualquer query

async function main() {
  await pool.query(`create table if not exists _migrations (nome text primary key, aplicada_em timestamptz default now())`);
  const dir = join(__dirname, 'migrations');
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const f of arquivos) {
    const ja = await pool.query('select 1 from _migrations where nome=$1', [f]);
    if (ja.rowCount) { console.log('• já aplicada:', f); continue; }
    const sql = readFileSync(join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('insert into _migrations (nome) values ($1)', [f]);
      await client.query('COMMIT');
      console.log('✓ aplicada:', f);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('✗ falhou:', f, e);
      process.exit(1);
    } finally {
      client.release();
    }
  }
  console.log('migrations concluídas');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
