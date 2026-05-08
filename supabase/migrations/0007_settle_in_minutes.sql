-- Per-match settle-in period: no substitutions during the first N minutes.
-- The scheduler floors every starter's first-block cap at this value (capped
-- by each player's own max_block — a player with max_block 10 will still
-- sub at minute 10, even if settle_in is 15). Null/0 means no settle-in.

alter table public.matches
  add column settle_in_minutes integer
    check (settle_in_minutes is null or settle_in_minutes between 0 and 60);
