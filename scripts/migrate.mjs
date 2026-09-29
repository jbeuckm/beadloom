#!/usr/bin/env node
// Apply db/migrations/*.sql to the Neon database, in order, once each.
//
//   npm run db:migrate            apply what's pending
//   npm run db:migrate -- --status   list applied / pending, change nothing
//   npm run db:migrate -- --refresh-api   just refresh the Data API's schema cache
//
// After applying, it refreshes the Neon Data API's schema cache so new tables
// and functions are reachable at once (the Data API doesn't notice on its
// own). That needs NEON_API_KEY and NEON_PROJECT_ID; without them it says so
// and the cache catches up later.
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
const refreshOnly = process.argv.includes('--refresh-api');

/** Refresh the schema cache of the Data API serving DATABASE_URL's branch. */
async function refreshDataApi() {
  const key = process.env.NEON_API_KEY;
  const project = process.env.NEON_PROJECT_ID;
  const u = new URL(url);
  if (!key || !project || u.hostname === 'localhost') {
    if (u.hostname !== 'localhost')
      console.log('Data API schema cache not refreshed (set NEON_API_KEY and NEON_PROJECT_ID to do it here).');
    return;
  }
  const api = async (method, path) => {
    const r = await fetch('https://console.neon.tech/api/v2' + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'PATCH' ? '{}' : undefined,
    });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const host = u.hostname.replace('-pooler', '');
  const { endpoints } = await api('GET', `/projects/${project}/endpoints`);
  const ep = endpoints.find((e) => e.host === host);
  if (!ep) throw new Error(`No endpoint ${host} in project ${project}`);
  const db = decodeURIComponent(u.pathname.slice(1));
  process.stdout.write('refreshing the Data API schema cache… ');
  await api('PATCH', `/projects/${project}/branches/${ep.branch_id}/data-api/${db}`);
  console.log('ok');
}
if (refreshOnly) {
  await refreshDataApi();
  process.exit(0);
}

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
    await client.end();
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
await refreshDataApi();
