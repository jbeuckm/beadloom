-- Grid Designer cloud schema — migration 0004: profile pictures.
--
-- A user picks one of their designs as their picture. The app renders it to a
-- small PNG and stores that here, not a reference to the design: other users
-- can read profiles but not the design itself, and the picture shouldn't
-- change or vanish when the design is edited or trashed.

alter table profiles add column if not exists avatar text
  check (avatar is null or (avatar like 'data:image/png;base64,%' and length(avatar) <= 60000));
grant update (avatar) on profiles to authenticated;
