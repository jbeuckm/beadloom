-- Stand-ins for what Neon provides, so migrations can be tried on a plain
-- local Postgres (see scripts/migrate.mjs). Never run this on Neon.
create schema if not exists auth;
-- Neon reads the JWT's claims as JSON (request.jwt.claims); the older single
-- setting (request.jwt.claim.sub) works here too, for quick tests.
create or replace function auth.user_id() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
                     current_setting('request.jwt.claim.sub', true)) $$;
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id text primary key, email text, name text, role text, banned boolean,
  "banReason" text, "createdAt" timestamptz default now(), "updatedAt" timestamptz default now()
);
create table if not exists neon_auth.session (id text primary key, "userId" text);
