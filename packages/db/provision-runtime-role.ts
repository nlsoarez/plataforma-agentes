import { Pool } from 'pg';
import { carregarEnv } from './src/index';

carregarEnv();

const adminUrl = process.env.DATABASE_ADMIN_URL;
const role = process.env.DATABASE_RUNTIME_USER || 'plataforma_runtime';
const password = process.env.DATABASE_RUNTIME_PASSWORD;

if (!adminUrl) throw new Error('DATABASE_ADMIN_URL deve ser configurada');
if (!password || password.length < 24) throw new Error('DATABASE_RUNTIME_PASSWORD deve ter pelo menos 24 caracteres');
if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error('DATABASE_RUNTIME_USER invalido');

const pool = new Pool({
  connectionString: adminUrl,
  ssl: /sslmode=require/.test(adminUrl) || process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
});

const ident = `"${role.replace(/"/g, '""')}"`;
const literal = `'${password.replace(/'/g, "''")}'`;

async function main() {
  const exists = (await pool.query('select 1 from pg_roles where rolname=$1', [role])).rowCount;
  if (!exists) {
    await pool.query(`create role ${ident} login password ${literal} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
  } else {
    await pool.query(`alter role ${ident} with login password ${literal} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
  }

  const database = (await pool.query('select current_database() as name')).rows[0].name;
  const databaseIdent = `"${String(database).replace(/"/g, '""')}"`;
  await pool.query(`grant connect on database ${databaseIdent} to ${ident}`);
  await pool.query(`grant usage on schema public to ${ident}`);
  await pool.query(`grant select, insert, update, delete on all tables in schema public to ${ident}`);
  await pool.query(`grant usage, select on all sequences in schema public to ${ident}`);
  await pool.query(`grant execute on all functions in schema public to ${ident}`);
  await pool.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${ident}`);
  await pool.query(`alter default privileges in schema public grant usage, select on sequences to ${ident}`);
  await pool.query(`alter default privileges in schema public grant execute on functions to ${ident}`);
  console.log(`role de runtime provisionada: ${role}`);
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
