-- Grid Designer cloud schema — migration 0003: usernames, friends, sharing.
--
-- Two kinds of sharing:
--   · with anyone — library_items.published puts a design in the public
--     gallery, readable signed out (gallery_read, from 0001);
--   · with friends — a row in shares, honoured only while the owner and the
--     grantee are friends: one asked (friendships row) and the other accepted.
-- Signed-in users find each other by username (profiles). Signed-out
-- visitors see no users at all.

-- ---- usernames ---------------------------------------------------------------
create table if not exists profiles (
  user_id     text primary key default auth.user_id(),
  username    text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_insert on profiles for insert to authenticated
  with check (user_id = auth.user_id());
create policy profiles_update on profiles for update to authenticated
  using (user_id = auth.user_id()) with check (user_id = auth.user_id());
grant select, insert on profiles to authenticated;
grant update (username) on profiles to authenticated;

-- ---- friends -----------------------------------------------------------------
-- One row per pair, whichever side asked. The addressee accepts by setting
-- accepted; either side removes it (decline, cancel, unfriend).
create table if not exists friendships (
  requester   text not null default auth.user_id() references profiles(user_id) on delete cascade,
  addressee   text not null references profiles(user_id) on delete cascade,
  accepted    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair
  on friendships (least(requester, addressee), greatest(requester, addressee));
alter table friendships enable row level security;
create policy friendships_mine on friendships for select to authenticated
  using (auth.user_id() in (requester, addressee));
create policy friendships_ask on friendships for insert to authenticated
  with check (requester = auth.user_id() and not accepted);
create policy friendships_accept on friendships for update to authenticated
  using (addressee = auth.user_id()) with check (addressee = auth.user_id());
create policy friendships_remove on friendships for delete to authenticated
  using (auth.user_id() in (requester, addressee));
grant select, insert, delete on friendships to authenticated;
grant update (accepted) on friendships to authenticated;

create or replace function private.are_friends(a text, b text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from friendships f
                 where f.accepted and least(f.requester, f.addressee) = least(a, b)
                   and greatest(f.requester, f.addressee) = greatest(a, b))
$$;
revoke all on function private.are_friends(text, text) from public;
grant execute on function private.are_friends(text, text) to authenticated;

-- unfriending takes back what the two had shared with each other
create or replace function private.drop_friend_shares() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from shares s using library_items i
   where s.item_id = i.id
     and ((i.owner_id = old.requester and s.grantee_id = old.addressee)
       or (i.owner_id = old.addressee and s.grantee_id = old.requester));
  return old;
end $$;
drop trigger if exists friendships_drop_shares on friendships;
create trigger friendships_drop_shares after delete on friendships
  for each row execute function private.drop_friend_shares();

-- ---- sharing with friends --------------------------------------------------------
-- A share grants access only while its owner and grantee are friends.
create or replace function private.has_share(item uuid, editor boolean) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from shares s join library_items i on i.id = s.item_id
                 where s.item_id = item and s.grantee_id = auth.user_id()
                   and (not editor or s.role = 'editor')
                   and private.are_friends(i.owner_id, s.grantee_id))
$$;

-- and can only be made to a friend
drop policy if exists shares_to_friends on shares;
create policy shares_to_friends on shares as restrictive for insert to authenticated
  with check (private.are_friends(auth.user_id(), grantee_id));

-- ---- sharing with anyone -------------------------------------------------------
-- published (0001) puts a design in the gallery; published_at orders it.
alter table library_items add column if not exists published_at timestamptz;
create index if not exists library_items_gallery
  on library_items (published_at desc) where published and deleted_at is null;
