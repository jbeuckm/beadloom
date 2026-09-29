-- Grid Designer cloud schema — migration 0005: likes and 5-star ratings.
--
-- A signed-in user can like and rate (1–5 stars) a design they can see but
-- don't own: one published to the gallery, or one a friend shared with them.
-- Each user's own reactions are private to them; everyone who can see a
-- design sees its totals, through reaction_stats().

-- can the signed-in (or anonymous) user see this item?
create or replace function private.can_see(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from library_items i
                 where i.id = item and i.deleted_at is null
                   and ((i.published and i.collection = 'design')
                        or i.owner_id = auth.user_id()
                        or private.has_share(i.id, false)))
$$;
-- …and react to it (not their own)
create or replace function private.can_react(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select private.can_see(item) and private.item_owner(item) <> auth.user_id()
$$;
revoke all on function private.can_see(uuid), private.can_react(uuid) from public;
grant execute on function private.can_see(uuid), private.can_react(uuid) to authenticated;

create table if not exists item_reactions (
  item_id     uuid not null references library_items(id) on delete cascade,
  user_id     text not null default auth.user_id(),
  liked       boolean not null default false,
  stars       smallint check (stars between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table item_reactions enable row level security;
create policy reactions_mine on item_reactions for select to authenticated
  using (user_id = auth.user_id());
create policy reactions_add on item_reactions for insert to authenticated
  with check (user_id = auth.user_id() and private.can_react(item_id));
create policy reactions_change on item_reactions for update to authenticated
  using (user_id = auth.user_id()) with check (user_id = auth.user_id() and private.can_react(item_id));
create policy reactions_remove on item_reactions for delete to authenticated
  using (user_id = auth.user_id());
grant select, insert, update, delete on item_reactions to authenticated;

-- Totals for the given items, only those the caller can see. Signed-out
-- visitors get the gallery's.
create or replace function reaction_stats(ids uuid[])
returns table (item_id uuid, likes integer, ratings integer, average numeric)
language sql security definer stable set search_path = public as $$
  select r.item_id,
         (count(*) filter (where r.liked))::integer,
         count(r.stars)::integer,
         round(avg(r.stars), 2)
    from item_reactions r
   where r.item_id = any(ids) and private.can_see(r.item_id)
   group by r.item_id
$$;
revoke all on function reaction_stats(uuid[]) from public;
grant execute on function reaction_stats(uuid[]) to anonymous, authenticated;
