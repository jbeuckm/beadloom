-- Chromattice cloud schema — migration 0008: like and rate your own designs.
--
-- 0005 kept owners from reacting to their own designs; now anyone may react
-- to any design they can see, their own included.

create or replace function private.can_react(item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select private.can_see(item)
$$;
