-- Grid Designer cloud schema for Neon (run once in the Neon SQL editor).
--
-- Rows are owned by the signed-in Neon Auth user: auth.user_id() returns the
-- `sub` claim of the JWT the Data API verified. Every rule lives in row-level
-- security, so it holds however the data is reached.
--
-- Phase 1 (accounts + sync) uses library_items, library_folders and
-- trash_origins. Phase 2 adds shares; phase 3 the public gallery (published).

create extension if not exists pgcrypto;

-- ---- items: every saved design and palette --------------------------------
create table if not exists library_items (
  id          uuid primary key,                       -- client-generated, stable across renames/moves
  owner_id    text not null default auth.user_id(),
  collection  text not null check (collection in ('design', 'palette')),
  path        text not null,                          -- "Gifts/Bracelet", ".Trash/Old" — as in the app
  doc         jsonb not null,                         -- the design / palette JSON
  modified    timestamptz not null default now(),     -- from the document; newest wins on sync
  deleted_at  timestamptz,                            -- soft delete, so other devices learn of it
  published   boolean not null default false          -- phase 3: shown in the public gallery
);
-- one live item per path; soft-deleted rows don't block re-creating the path
create unique index if not exists library_items_live_path
  on library_items (owner_id, collection, path) where deleted_at is null;
create index if not exists library_items_owner_modified on library_items (owner_id, modified);
create index if not exists library_items_published on library_items (published) where published;

-- ---- empty folders (folders with files in them are implied by paths) -------
create table if not exists library_folders (
  owner_id    text not null default auth.user_id(),
  collection  text not null check (collection in ('design', 'palette')),
  path        text not null,
  primary key (owner_id, collection, path)
);

-- ---- where a trashed item came from, for "Put Back" -----------------------
create table if not exists trash_origins (
  owner_id    text not null default auth.user_id(),
  collection  text not null check (collection in ('design', 'palette')),
  path        text not null,                          -- the item's path inside .Trash
  origin      text not null,                          -- folder to put it back into
  primary key (owner_id, collection, path)
);

-- ---- phase 2: sharing ------------------------------------------------------
create table if not exists shares (
  item_id     uuid not null references library_items(id) on delete cascade,
  grantee_id  text not null,
  role        text not null check (role in ('viewer', 'editor')),
  created_by  text not null default auth.user_id(),
  created_at  timestamptz not null default now(),
  primary key (item_id, grantee_id)
);

-- ---- row-level security ----------------------------------------------------
alter table library_items   enable row level security;
alter table library_folders enable row level security;
alter table trash_origins   enable row level security;
alter table shares          enable row level security;

-- owners: everything on their own rows
create policy own_items on library_items for all to authenticated
  using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());
create policy own_folders on library_folders for all to authenticated
  using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());
create policy own_trash on trash_origins for all to authenticated
  using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());

-- phase 2 · shared with me: read
create policy shared_read on library_items for select to authenticated
  using (exists (select 1 from shares s
                 where s.item_id = library_items.id and s.grantee_id = auth.user_id()));

-- phase 2 · shared with me as editor: update the document, never ownership or path
create policy shared_edit on library_items for update to authenticated
  using (exists (select 1 from shares s
                 where s.item_id = library_items.id
                   and s.grantee_id = auth.user_id() and s.role = 'editor'))
  with check (owner_id = (select i.owner_id from library_items i where i.id = library_items.id));

-- phase 2 · the owner manages shares; grantees see their own
create policy shares_owner on shares for all to authenticated
  using (exists (select 1 from library_items i where i.id = item_id and i.owner_id = auth.user_id()))
  with check (exists (select 1 from library_items i where i.id = item_id and i.owner_id = auth.user_id()));
create policy shares_mine on shares for select to authenticated
  using (grantee_id = auth.user_id());

-- phase 3 · the public gallery: anyone can read a published design
create policy gallery_read on library_items for select to anonymous, authenticated
  using (published and collection = 'design' and deleted_at is null);

grant usage on schema public to authenticated, anonymous;
grant select, insert, update, delete on library_items, library_folders, trash_origins, shares to authenticated;
grant select on library_items to anonymous;

-- phase 2 · sharing by email needs an email → user id lookup without exposing
-- the user table. Neon Auth keeps users in neon_auth."user".
create or replace function find_user_id(email text) returns text
language sql security definer stable as $$
  select u.id::text from neon_auth."user" u where lower(u.email) = lower(find_user_id.email) limit 1
$$;
revoke all on function find_user_id(text) from public;
grant execute on function find_user_id(text) to authenticated;
