-- Grid Designer cloud schema — migration 0002: break the policy recursion.
--
-- 0001's sharing policies looked each other up: reading library_items ran
-- shared_read, which read shares, whose shares_owner policy read library_items
-- again ("infinite recursion detected in policy"). shared_edit's check also
-- read library_items from inside its own policy.
--
-- The cross-table lookups now go through security definer functions. They run
-- as the tables' owner, which row-level security doesn't apply to, so no policy
-- is re-entered. They live in their own schema so the Data API (which exposes
-- public) doesn't offer them as RPC endpoints.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- owner of an item, or null if it doesn't exist
create or replace function private.item_owner(item uuid) returns text
language sql security definer stable set search_path = public as $$
  select owner_id from library_items where id = item
$$;

-- does the signed-in user hold a share on the item (of at least this role)?
create or replace function private.has_share(item uuid, editor boolean) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from shares s
                 where s.item_id = item and s.grantee_id = auth.user_id()
                   and (not editor or s.role = 'editor'))
$$;

-- path of an item as stored (before the update being checked)
create or replace function private.item_path(item uuid) returns text
language sql security definer stable set search_path = public as $$
  select path from library_items where id = item
$$;

revoke all on function private.item_owner(uuid), private.item_path(uuid), private.has_share(uuid, boolean) from public;
grant execute on function private.item_owner(uuid), private.item_path(uuid), private.has_share(uuid, boolean) to authenticated;

drop policy if exists shared_read on library_items;
create policy shared_read on library_items for select to authenticated
  using (private.has_share(id, false));

drop policy if exists shared_edit on library_items;
create policy shared_edit on library_items for update to authenticated
  using (private.has_share(id, true));

-- Permissive policies are OR'd, so 0001's shared_edit check never held: an
-- editor passed own_items' check by setting owner_id to themselves. This one
-- is restrictive (AND'd with the rest): an update never changes the owner, and
-- only the owner moves or renames.
drop policy if exists keep_owner on library_items;
create policy keep_owner on library_items as restrictive for update to authenticated
  using (true)
  with check (owner_id = private.item_owner(id)
              and (owner_id = auth.user_id() or path = private.item_path(id)));

drop policy if exists shares_owner on shares;
create policy shares_owner on shares for all to authenticated
  using (private.item_owner(item_id) = auth.user_id())
  with check (private.item_owner(item_id) = auth.user_id());
