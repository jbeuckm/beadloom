#!/usr/bin/env node
// Give someone a staff role (or take it away), straight in the database. The
// first admin has to be made this way; after that, admins use the Admin page.
//
//   npm run set-role -- <email> <admin|moderator|user>
//
// Connects with DATABASE_URL from .env (like db:migrate). The change is
// written to the moderation log as done by "command line".

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile))
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }

const [email, role] = process.argv.slice(2);
if (!email || !['admin', 'moderator', 'user'].includes(role)) {
  console.error('Usage: npm run set-role -- <email> <admin|moderator|user>');
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: true } });
await client.connect();
try {
  const r = await client.query(
    `update neon_auth."user" set role = $2, "updatedAt" = now() where lower(email) = lower($1) returning id::text`,
    [email, role],
  );
  if (!r.rowCount) {
    console.error(`No account with the email ${email}`);
    process.exit(1);
  }
  await client.query(
    `insert into moderation_log (actor_id, action, target_kind, target_id) values ('command line', $1, 'user', $2)`,
    [`role:${role}`, r.rows[0].id],
  );
  console.log(`${email} is now ${role === 'user' ? 'a regular user' : `a${role === 'admin' ? 'n' : ''} ${role}`}.`);
} finally {
  await client.end();
}
