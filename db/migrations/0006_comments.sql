-- Grid Designer cloud schema — migration 0006: comments on designs.
--
-- Signed-in users with a username comment on designs they can see (published,
-- shared with them, or their own). Comments are visible to signed-in users who
-- can see the design; signed-out visitors see only how many there are. The
-- author or the design's owner can delete a comment.

create table if not exists item_comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references library_items(id) on delete cascade,
  author_id   text not null default auth.user_id(),
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists item_comments_item on item_comments (item_id, created_at);
alter table item_comments enable row level security;
create policy comments_read on item_comments for select to authenticated
  using (private.can_see(item_id));
create policy comments_add on item_comments for insert to authenticated
  with check (author_id = auth.user_id() and private.can_see(item_id)
              and exists (select 1 from profiles p where p.user_id = auth.user_id()));
create policy comments_remove on item_comments for delete to authenticated
  using (author_id = auth.user_id() or private.item_owner(item_id) = auth.user_id());
grant select, insert, delete on item_comments to authenticated;

-- reaction_stats() gains the comment count (a new result column: drop, recreate)
drop function if exists reaction_stats(uuid[]);
create function reaction_stats(ids uuid[])
returns table (item_id uuid, likes integer, ratings integer, average numeric, comments integer)
language sql security definer stable set search_path = public as $$
  with visible as (select unnest(ids) as id),
  r as (
    select r.item_id, (count(*) filter (where r.liked))::integer as likes,
           count(r.stars)::integer as ratings, round(avg(r.stars), 2) as average
      from item_reactions r where r.item_id = any(ids) group by r.item_id),
  c as (
    select c.item_id, count(*)::integer as comments
      from item_comments c where c.item_id = any(ids) group by c.item_id)
  select v.id, coalesce(r.likes, 0), coalesce(r.ratings, 0), r.average, coalesce(c.comments, 0)
    from visible v left join r on r.item_id = v.id left join c on c.item_id = v.id
   where private.can_see(v.id) and (r.item_id is not null or c.item_id is not null)
$$;
revoke all on function reaction_stats(uuid[]) from public;
grant execute on function reaction_stats(uuid[]) to anonymous, authenticated;
