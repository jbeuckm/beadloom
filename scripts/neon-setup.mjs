#!/usr/bin/env node
// One-time Neon setup through the management API, so nobody has to click
// through the console:
//
//   npm run neon:setup             create/reuse the project, enable Neon Auth,
//                                  allow the app's redirect URLs, create the
//                                  Data API, write the URLs into .env
//   npm run neon:setup -- --migrate   …then run the database migrations
//
// Needs NEON_API_KEY (from console.neon.tech → Account settings → API keys) in
// .env or the environment. Idempotent: run it again and it reuses what exists.
// Optional: NEON_PROJECT_ID to target an existing project, NEON_PROJECT_NAME
// (default "chromattice"), NEON_REGION (default aws-us-east-2).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, '.env');
const API = 'https://console.neon.tech/api/v2';

// the app's origins: where sign-up verification and password-reset links land
const REDIRECT_ORIGINS = ['https://jbeuckm.github.io', 'http://localhost:5847'];

function readEnv() {
  const out = {};
  if (!existsSync(envFile)) return out;
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
/** Set keys in .env, keeping every other line (comments included) as it is. */
function updateEnv(values) {
  let text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else text += `${text.endsWith('\n') || !text ? '' : '\n'}${k}=${v}\n`;
  }
  writeFileSync(envFile, text);
}

const env = { ...readEnv(), ...process.env };
const key = env.NEON_API_KEY;
if (!key || key === 'napi_xxx') {
  console.error('NEON_API_KEY is not set. Put a Neon API key in .env (see .env.example).');
  process.exit(2);
}
const migrateAfter = process.argv.includes('--migrate');

async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(`${method} ${path} → ${r.status} ${data?.message ?? data?.error ?? text.slice(0, 200)}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}
const step = (s) => process.stdout.write(`${s}… `);
const done = (s = 'ok') => console.log(s);
const isNotFound = (e) => e.status === 404;

// ---- project ---------------------------------------------------------------
let projectId = env.NEON_PROJECT_ID;
const projectName = env.NEON_PROJECT_NAME || 'chromattice';
if (projectId) {
  step(`Using project ${projectId}`);
  await api('GET', `/projects/${projectId}`);
  done();
} else {
  step(`Looking for a project named "${projectName}"`);
  // a project-scoped key can't list projects; the refusal names its project
  let list = null;
  let scopedId = null;
  try {
    list = await api('GET', '/projects?limit=400');
  } catch (e) {
    scopedId = /subject_project_id:"([^"]+)"/.exec(e.data?.message ?? '')?.[1];
    if (!scopedId) throw e;
  }
  const found = (list?.projects ?? []).find((p) => p.name === projectName);
  if (scopedId) {
    projectId = scopedId;
    done(`key is scoped to ${projectId}, using it`);
  } else if (found) {
    projectId = found.id;
    done(`found ${projectId}`);
  } else {
    done('none');
    step(`Creating project "${projectName}"`);
    const made = await api('POST', '/projects', {
      project: { name: projectName, region_id: env.NEON_REGION || 'aws-us-east-2' },
    });
    projectId = made.project.id;
    done(projectId);
  }
}

// ---- default branch and database -----------------------------------------------
step('Finding the default branch');
const branches = await api('GET', `/projects/${projectId}/branches`);
const branch = (branches.branches ?? []).find((b) => b.default) ?? branches.branches?.[0];
if (!branch) throw new Error('The project has no branches');
done(`${branch.name} (${branch.id})`);

step('Finding the database');
const dbs = await api('GET', `/projects/${projectId}/branches/${branch.id}/databases`);
const db = dbs.databases?.[0];
if (!db) throw new Error('The branch has no database');
done(`${db.name} (owner ${db.owner_name})`);

// ---- Neon Auth ------------------------------------------------------------------
let auth;
step('Neon Auth');
try {
  auth = await api('GET', `/projects/${projectId}/branches/${branch.id}/auth`);
  done(`already enabled (${auth.auth_provider})`);
} catch (e) {
  if (!isNotFound(e)) throw e;
  done('enabling');
  step('  enabling Managed Better Auth');
  auth = await api('POST', `/projects/${projectId}/branches/${branch.id}/auth`, {
    auth_provider: 'better_auth',
    database_name: db.name,
  });
  done();
}
const authUrl = auth.base_url;
if (!authUrl) throw new Error('Neon Auth returned no base_url');

step('Redirect URL allowlist');
const domains = await api('GET', `/projects/${projectId}/branches/${branch.id}/auth/domains`);
const have = new Set((domains.domains ?? []).map((d) => (typeof d === 'string' ? d : d.domain)));
const missing = REDIRECT_ORIGINS.filter((o) => !have.has(o));
for (const domain of missing)
  await api('POST', `/projects/${projectId}/branches/${branch.id}/auth/domains`, {
    domain,
    auth_provider: auth.auth_provider ?? 'better_auth',
  });
done(missing.length ? `added ${missing.join(', ')}` : 'already complete');

// ---- Data API -------------------------------------------------------------------
let dataApi;
step('Data API');
try {
  dataApi = await api('GET', `/projects/${projectId}/branches/${branch.id}/data-api/${db.name}`);
  done(`already enabled (${dataApi.status ?? 'ok'})`);
} catch (e) {
  if (!isNotFound(e)) throw e;
  done('creating');
  step('  creating, authenticated by Neon Auth');
  dataApi = await api('POST', `/projects/${projectId}/branches/${branch.id}/data-api/${db.name}`, {
    auth_provider: 'neon_auth',
    add_default_grants: false, // db/migrations grants exactly what each table needs
    settings: { db_anon_role: 'anonymous' },
  });
  done();
}
const dataApiUrl = dataApi.url;
if (!dataApiUrl) throw new Error('The Data API returned no url');

// ---- connection string (for migrations only) --------------------------------------
step('Connection string');
const conn = await api(
  'GET',
  `/projects/${projectId}/connection_uri?branch_id=${branch.id}&database_name=${encodeURIComponent(db.name)}&role_name=${encodeURIComponent(db.owner_name)}`,
);
done('ok');

updateEnv({
  NEON_PROJECT_ID: projectId,
  VITE_NEON_AUTH_URL: authUrl,
  VITE_NEON_DATA_API_URL: dataApiUrl,
  DATABASE_URL: conn.uri,
});
console.log(`
Written to .env:
  NEON_PROJECT_ID        ${projectId}
  VITE_NEON_AUTH_URL     ${authUrl}
  VITE_NEON_DATA_API_URL ${dataApiUrl}
  DATABASE_URL           ${conn.uri.replace(/:[^:@/]+@/, ':****@')}

Next: add DATABASE_URL as a repository secret for the migrate workflow, and
in the Neon console (Auth → Settings) set a custom email sender before real users.`);

if (migrateAfter) {
  console.log('\nRunning migrations…');
  const r = spawnSync(process.execPath, [resolve(root, 'scripts/migrate.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: conn.uri },
  });
  process.exit(r.status ?? 1);
}
