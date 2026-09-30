-- Chromattice cloud schema — migration 0007: posts (a journal about designs).
--
-- A signed-in user with a username writes posts: a title, a body, and up to
-- 12 of their own designs. Each post is a draft (only its author), for
-- friends, or public (anyone, signed out too). Attaching a design to a post
-- lets the post's readers see that design, so it needn't be shared on its own.

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     text not null default auth.user_id() references profiles(user_id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  body          text not null default '' check (length(body) <= 20000),
  visibility    text not null default 'draft' check (visibility in ('draft', 'friends', 'public')),
  design_ids    uuid[] not null default '{}' check (cardinality(design_ids) <= 12),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index if not exists posts_published on posts (published_at desc) where visibility <> 'draft';
create index if not exists posts_author on posts (author_id, updated_at desc);

-- every attached design is the author's own
create or replace function private.owns_all(ids uuid[]) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from unnest(ids) as x(id)
                     where private.item_owner(x.id) is distinct from auth.user_id())
$$;
revoke all on function private.owns_all(uuid[]) from public;
grant execute on function private.owns_all(uuid[]) to authenticated;

alter table posts enable row level security;
create policy posts_public on posts for select to anonymous using (visibility = 'public');
create policy posts_read on posts for select to authenticated
  using (visibility = 'public' or author_id = auth.user_id()
         or (visibility = 'friends' and private.are_friends(author_id, auth.user_id())));
create policy posts_write on posts for insert to authenticated
  with check (author_id = auth.user_id() and private.owns_all(design_ids));
create policy posts_edit on posts for update to authenticated
  using (author_id = auth.user_id()) with check (author_id = auth.user_id() and private.owns_all(design_ids));
create policy posts_remove on posts for delete to authenticated using (author_id = auth.user_id());
grant select on posts to anonymous, authenticated;
grant insert, update, delete on posts to authenticated;

-- is this design in a post the caller can read?
create or replace function private.in_readable_post(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from posts p
                 where item = any(p.design_ids) and p.visibility <> 'draft'
                   and (p.visibility = 'public' or p.author_id = auth.user_id()
                        or (p.visibility = 'friends' and private.are_friends(p.author_id, auth.user_id()))))
$$;
grant usage on schema private to anonymous;
revoke all on function private.in_readable_post(uuid) from public;
grant execute on function private.in_readable_post(uuid) to anonymous, authenticated;

-- readers of a post can read its designs…
create policy post_read on library_items for select to anonymous, authenticated
  using (deleted_at is null and private.in_readable_post(id));

-- …and like, rate and comment on them like any design they can see
create or replace function private.can_see(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from library_items i
                 where i.id = item and i.deleted_at is null
                   and ((i.published and i.collection = 'design')
                        or i.owner_id = auth.user_id()
                        or private.has_share(i.id, false)
                        or private.in_readable_post(i.id)))
$$;
