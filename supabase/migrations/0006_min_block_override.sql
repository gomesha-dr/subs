-- Per-match minimum max_block override. When set, the scheduler treats each
-- attending player's effective max_block as max(profile.max_block, this value).
-- Lets the captain raise the floor when the squad is small enough that some
-- players' default blocks cause unfillable rest collisions.

alter table public.matches
  add column min_block_override_minutes integer
    check (min_block_override_minutes is null or min_block_override_minutes between 1 and 240);
