-- Stand-ins for what Neon provides, so migrations can be tried on a plain
-- local Postgres (see scripts/migrate.mjs). Never run this on Neon.
create role authenticated nologin;
create role anonymous nologin;
create schema if not exists auth;
create or replace function auth.user_id() returns text language sql stable as
  $$ select current_setting('request.jwt.claim.sub', true) $$;
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (id text primary key, email text);
