#!/usr/bin/env node
// Apply db/migrations/*.sql to the Neon database, in order, once each.
//
//   npm run db:migrate            apply what's pending
//   npm run db:migrate -- --status   list applied / pending, change nothing
//
// Connects with DATABASE_URL (the Neon connection string, from .env or the
// environment — never shipped to the browser). Applied versions are recorded
// in schema_migrations, which the app also reads to check the database is
// current (src/lib/cloud/schema.ts).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'db/migrations');

// a tiny .env reader, so the runner needs no extra dependency
function loadEnv() {
  const f = resolve(root, '.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (put the Neon connection string in .env).');
  process.exit(2);
}
const statusOnly = process.argv.includes('--status');

const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort()
  .map((f) => ({ version: Number(f.slice(0, 4)), name: f.slice(5, -4), file: resolve(dir, f) }));

const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query(`
    create table if not exists schema_migrations (
      version     integer primary key,
      name        text not null,
      applied_at  timestamptz not null default now()
    )`);
  const { rows } = await client.query('select version from schema_migrations order by version');
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((m) => !applied.has(m.version));

  for (const m of files)
    console.log(`${applied.has(m.version) ? 'applied' : 'pending'}  ${String(m.version).padStart(4, '0')}  ${m.name}`);
  if (statusOnly || !pending.length) {
    console.log(pending.length ? `${pending.length} pending` : 'Database is up to date.');
    process.exit(0);
  }

  for (const m of pending) {
    const sql = readFileSync(m.file, 'utf8');
    process.stdout.write(`applying ${String(m.version).padStart(4, '0')} ${m.name}… `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (version, name) values ($1, $2)', [m.version, m.name]);
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(e.message);
      process.exit(1);
    }
  }
  console.log('Database is up to date.');
} finally {
  await client.end();
}
