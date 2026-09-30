-- Chromattice cloud schema — migration 0009: staff roles, reports, moderation.
--
-- Roles live on Neon Auth's own user row (neon_auth."user".role): 'user'
-- (default), 'moderator', 'admin'. Moderators work the report queue, hide and
-- restore gallery designs and posts, delete comments, and suspend users.
-- Admins can do all that, change roles, and ban (Neon Auth's "banned" flag:
-- no signing in; their sessions end).
--
-- A suspended user can still sign in and use their own storage, but can't
-- publish, share, post, comment, react or ask to be friends.
--
-- Staff actions are functions (exposed by the Data API as RPC) that check the
-- caller's role first, and each one is written to moderation_log.

-- ---- who's who --------------------------------------------------------------
create or replace function private.role_of(uid text) returns text
language sql security definer stable set search_path = public as $$
  select coalesce((select u.role from neon_auth."user" u where u.id::text = uid), 'user')
$$;
create or replace function private.is_mod() returns boolean
language sql security definer stable set search_path = public as $$
  select private.role_of(auth.user_id()) in ('moderator', 'admin')
$$;
create or replace function private.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select private.role_of(auth.user_id()) = 'admin'
$$;

create table if not exists suspensions (
  user_id       text primary key,
  reason        text not null,
  suspended_by  text not null,
  suspended_at  timestamptz not null default now()
);
alter table suspensions enable row level security; -- read and written through the functions below only

create or replace function private.is_suspended(uid text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from suspensions s where s.user_id = uid)
$$;
revoke all on function private.role_of(text), private.is_mod(), private.is_admin(), private.is_suspended(text) from public;
grant execute on function private.role_of(text), private.is_mod(), private.is_admin(), private.is_suspended(text)
  to anonymous, authenticated;

-- ---- hidden content ------------------------------------------------------------
alter table library_items add column if not exists hidden_at timestamptz;
alter table library_items add column if not exists hidden_reason text;
alter table posts add column if not exists hidden_at timestamptz;
alter table posts add column if not exists hidden_reason text;

-- a hidden design leaves the gallery, and everyone's view but its owner's
drop policy if exists gallery_read on library_items;
create policy gallery_read on library_items for select to anonymous, authenticated
  using (published and collection = 'design' and deleted_at is null and hidden_at is null);
drop policy if exists shared_read on library_items;
create policy shared_read on library_items for select to authenticated
  using (hidden_at is null and private.has_share(id, false));
drop policy if exists post_read on library_items;
create policy post_read on library_items for select to anonymous, authenticated
  using (deleted_at is null and hidden_at is null and private.in_readable_post(id));
create or replace function private.can_see(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from library_items i
                 where i.id = item and i.deleted_at is null
                   and (i.owner_id = auth.user_id()
                        or (i.hidden_at is null
                            and ((i.published and i.collection = 'design')
                                 or private.has_share(i.id, false)
                                 or private.in_readable_post(i.id)))))
$$;
-- …and a hidden post, everyone's but its author's
drop policy if exists posts_public on posts;
create policy posts_public on posts for select to anonymous using (visibility = 'public' and hidden_at is null);
drop policy if exists posts_read on posts;
create policy posts_read on posts for select to authenticated
  using (author_id = auth.user_id()
         or (hidden_at is null
             and (visibility = 'public'
                  or (visibility = 'friends' and private.are_friends(author_id, auth.user_id())))));
-- (only the staff functions set hidden_*: an owner's update can't change it)
create or replace function private.item_hidden_at(item uuid) returns timestamptz
language sql security definer stable set search_path = public as $$
  select hidden_at from library_items where id = item
$$;
create or replace function private.post_hidden_at(post uuid) returns timestamptz
language sql security definer stable set search_path = public as $$
  select hidden_at from posts where id = post
$$;
create or replace function private.item_published(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select published from library_items where id = item), false)
$$;
revoke all on function private.item_hidden_at(uuid), private.post_hidden_at(uuid), private.item_published(uuid) from public;
grant execute on function private.item_hidden_at(uuid), private.post_hidden_at(uuid), private.item_published(uuid) to authenticated;
create policy keep_hidden_items on library_items as restrictive for update to authenticated
  using (true) with check (hidden_at is not distinct from private.item_hidden_at(id));
create policy no_hidden_insert on library_items as restrictive for insert to authenticated
  with check (hidden_at is null);
create policy keep_hidden_posts on posts as restrictive for update to authenticated
  using (true) with check (hidden_at is not distinct from private.post_hidden_at(id));

-- ---- what a suspended user can't do ------------------------------------------------
-- (publishing anew, that is: saving a design that was already public still works)
create policy not_suspended_publish on library_items as restrictive for update to authenticated
  using (true) with check (not published or private.item_published(id) or not private.is_suspended(auth.user_id()));
create policy not_suspended_post on posts as restrictive for all to authenticated
  using (true) with check (visibility = 'draft' or not private.is_suspended(auth.user_id()));
create policy not_suspended_share on shares as restrictive for insert to authenticated
  with check (not private.is_suspended(auth.user_id()));
create policy not_suspended_comment on item_comments as restrictive for insert to authenticated
  with check (not private.is_suspended(auth.user_id()));
create policy not_suspended_react on item_reactions as restrictive for all to authenticated
  using (true) with check (not private.is_suspended(auth.user_id()));
create policy not_suspended_friend on friendships as restrictive for insert to authenticated
  with check (not private.is_suspended(auth.user_id()));
create policy not_suspended_profile on profiles as restrictive for update to authenticated
  using (true) with check (not private.is_suspended(auth.user_id()));

-- ---- reports and the log ------------------------------------------------------------
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('design', 'post', 'comment')),
  target_id    uuid not null,
  reporter_id  text not null default auth.user_id(),
  reason       text not null check (length(btrim(reason)) between 1 and 1000),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text,
  resolution   text
);
create index if not exists reports_open on reports (created_at) where resolved_at is null;
alter table reports enable row level security;
create policy reports_file on reports for insert to authenticated
  with check (reporter_id = auth.user_id() and not private.is_suspended(auth.user_id()));
create policy reports_mine on reports for select to authenticated using (reporter_id = auth.user_id());
grant select, insert on reports to authenticated;

create table if not exists moderation_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    text not null,
  action      text not null,
  target_kind text not null,
  target_id   text not null,
  reason      text
);
alter table moderation_log enable row level security; -- read through staff_log() only

create or replace function private.log(action text, kind text, target text, why text) returns void
language sql security definer set search_path = public as $$
  insert into moderation_log (actor_id, action, target_kind, target_id, reason)
  values (auth.user_id(), action, kind, target, why)
$$;
create or replace function private.need(role text) returns void
language plpgsql security definer stable set search_path = public as $$
begin
  if role = 'admin' and not private.is_admin() then raise exception 'Only an admin can do that' using errcode = '42501'; end if;
  if role = 'moderator' and not private.is_mod() then raise exception 'Only staff can do that' using errcode = '42501'; end if;
end $$;
revoke all on function private.log(text, text, text, text), private.need(text) from public;

-- ---- for everyone ---------------------------------------------------------------
/** My role, and whether (and why) I'm suspended. */
create or replace function my_standing() returns table (role text, suspended_reason text)
language sql security definer stable set search_path = public as $$
  select private.role_of(auth.user_id()),
         (select s.reason from suspensions s where s.user_id = auth.user_id())
$$;

-- ---- for staff ------------------------------------------------------------------
/** Open reports, one row per reported thing, with what's needed to judge it. */
create or replace function staff_queue()
returns table (kind text, target_id uuid, reports integer, reasons text[], first_at timestamptz,
               title text, owner_id text, owner_name text, doc jsonb, body text, hidden boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  perform private.need('moderator');
  return query
  select r.kind, r.target_id, count(*)::integer, array_agg(r.reason order by r.created_at), min(r.created_at),
         coalesce(i.path, p.title, 'Comment'),
         coalesce(i.owner_id, p.author_id, c.author_id),
         (select pr.username from profiles pr where pr.user_id = coalesce(i.owner_id, p.author_id, c.author_id)),
         i.doc, coalesce(p.body, c.body),
         coalesce(i.hidden_at, p.hidden_at) is not null
    from reports r
    left join library_items i on r.kind = 'design' and i.id = r.target_id
    left join posts p on r.kind = 'post' and p.id = r.target_id
    left join item_comments c on r.kind = 'comment' and c.id = r.target_id
   where r.resolved_at is null
   group by r.kind, r.target_id, i.path, p.title, i.owner_id, p.author_id, c.author_id, i.doc, p.body, c.body, i.hidden_at, p.hidden_at
   order by min(r.created_at);
end $$;

/** Everything in the gallery and journal, hidden or not, newest first. */
create or replace function staff_content(what text)
returns table (id uuid, title text, owner_id text, owner_name text, doc jsonb, body text,
               at timestamptz, hidden_reason text, hidden boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  perform private.need('moderator');
  if what = 'design' then
    return query
    select i.id, i.path, i.owner_id, (select pr.username from profiles pr where pr.user_id = i.owner_id), i.doc, null::text,
           coalesce(i.published_at, i.modified), i.hidden_reason, i.hidden_at is not null
      from library_items i
     where i.collection = 'design' and i.deleted_at is null and (i.published or i.hidden_at is not null)
     order by coalesce(i.published_at, i.modified) desc limit 200;
  else
    return query
    select p.id, p.title, p.author_id, (select pr.username from profiles pr where pr.user_id = p.author_id), null::jsonb, p.body,
           p.published_at, p.hidden_reason, p.hidden_at is not null
      from posts p where p.visibility <> 'draft'
     order by p.published_at desc nulls last limit 200;
  end if;
end $$;

/** Hide (or restore) a design or post; its open reports are resolved. */
create or replace function staff_set_hidden(what text, target uuid, hide boolean, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('moderator');
  if hide and coalesce(btrim(why), '') = '' then raise exception 'Say why it is hidden'; end if;
  if what = 'design' then
    update library_items set hidden_at = case when hide then now() end, hidden_reason = case when hide then why end
     where id = target;
  elsif what = 'post' then
    update posts set hidden_at = case when hide then now() end, hidden_reason = case when hide then why end
     where id = target;
  else
    raise exception 'Nothing to hide of kind %', what;
  end if;
  perform private.log(case when hide then 'hide' else 'restore' end, what, target::text, why);
  update reports set resolved_at = now(), resolved_by = auth.user_id(), resolution = case when hide then 'hidden' else 'restored' end
   where kind = what and target_id = target and resolved_at is null;
end $$;

create or replace function staff_delete_comment(target uuid, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('moderator');
  delete from item_comments where id = target;
  perform private.log('delete', 'comment', target::text, why);
  update reports set resolved_at = now(), resolved_by = auth.user_id(), resolution = 'deleted'
   where kind = 'comment' and target_id = target and resolved_at is null;
end $$;

/** Close a thing's open reports without acting on it. */
create or replace function staff_dismiss(what text, target uuid, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('moderator');
  update reports set resolved_at = now(), resolved_by = auth.user_id(), resolution = 'dismissed'
   where kind = what and target_id = target and resolved_at is null;
  perform private.log('dismiss', what, target::text, why);
end $$;

/** The people: for staff (moderators suspend; admins set roles and ban). */
create or replace function staff_users(q text)
returns table (id text, email text, name text, username text, role text, banned boolean, suspended_reason text,
               created_at timestamptz, designs integer, published integer)
language plpgsql security definer stable set search_path = public as $$
begin
  perform private.need('moderator');
  return query
  select u.id::text, u.email, u.name, pr.username, coalesce(u.role, 'user'), coalesce(u.banned, false),
         (select s.reason from suspensions s where s.user_id = u.id::text), u."createdAt",
         (select count(*)::integer from library_items i where i.owner_id = u.id::text and i.deleted_at is null and i.collection = 'design'),
         (select count(*)::integer from library_items i where i.owner_id = u.id::text and i.published and i.deleted_at is null)
    from neon_auth."user" u left join profiles pr on pr.user_id = u.id::text
   where coalesce(q, '') = '' or u.email ilike '%' || q || '%' or pr.username ilike '%' || q || '%' or u.name ilike '%' || q || '%'
   order by u."createdAt" desc limit 200;
end $$;

create or replace function staff_suspend(target text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('moderator');
  if coalesce(btrim(why), '') = '' then raise exception 'Say why'; end if;
  if private.role_of(target) <> 'user' and not private.is_admin() then raise exception 'Only an admin can suspend staff' using errcode = '42501'; end if;
  insert into suspensions (user_id, reason, suspended_by) values (target, why, auth.user_id())
  on conflict (user_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
  perform private.log('suspend', 'user', target, why);
end $$;
create or replace function staff_unsuspend(target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('moderator');
  delete from suspensions where user_id = target;
  perform private.log('unsuspend', 'user', target, null);
end $$;

create or replace function admin_set_role(target text, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('admin');
  if new_role not in ('user', 'moderator', 'admin') then raise exception 'No such role: %', new_role; end if;
  if target = auth.user_id() and new_role <> 'admin' then raise exception 'You can''t remove your own admin role'; end if;
  update neon_auth."user" set role = new_role, "updatedAt" = now() where id::text = target;
  perform private.log('role:' || new_role, 'user', target, null);
end $$;

/** No signing in (Neon Auth refuses a banned user) and their sessions end. */
create or replace function admin_ban(target text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('admin');
  if target = auth.user_id() then raise exception 'You can''t ban yourself'; end if;
  if coalesce(btrim(why), '') = '' then raise exception 'Say why'; end if;
  update neon_auth."user" set banned = true, "banReason" = why, "updatedAt" = now() where id::text = target;
  delete from neon_auth.session where "userId"::text = target;
  perform private.log('ban', 'user', target, why);
end $$;
create or replace function admin_unban(target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('admin');
  update neon_auth."user" set banned = false, "banReason" = null, "updatedAt" = now() where id::text = target;
  perform private.log('unban', 'user', target, null);
end $$;

create or replace function staff_log(n integer)
returns table (at timestamptz, actor text, action text, target_kind text, target_id text, reason text)
language plpgsql security definer stable set search_path = public as $$
begin
  perform private.need('moderator');
  return query
  select l.at, coalesce((select pr.username from profiles pr where pr.user_id = l.actor_id), l.actor_id),
         l.action, l.target_kind, l.target_id, l.reason
    from moderation_log l order by l.at desc limit least(n, 500);
end $$;

revoke all on function my_standing(), staff_queue(), staff_content(text), staff_set_hidden(text, uuid, boolean, text),
  staff_delete_comment(uuid, text), staff_dismiss(text, uuid, text), staff_users(text), staff_suspend(text, text),
  staff_unsuspend(text), admin_set_role(text, text), admin_ban(text, text), admin_unban(text), staff_log(integer) from public;
grant execute on function my_standing(), staff_queue(), staff_content(text), staff_set_hidden(text, uuid, boolean, text),
  staff_delete_comment(uuid, text), staff_dismiss(text, uuid, text), staff_users(text), staff_suspend(text, text),
  staff_unsuspend(text), admin_set_role(text, text), admin_ban(text, text), admin_unban(text), staff_log(integer)
  to authenticated;
