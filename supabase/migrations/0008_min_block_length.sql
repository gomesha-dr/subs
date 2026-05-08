-- Per-match minimum-block-length override. The scheduler refuses to start
-- a block (or extends one in progress) so that no single stint is shorter
-- than this. Null = use the default (10 min). 0 = disable the constraint
-- (allows any length).

alter table public.matches
  add column min_block_length_minutes integer
    check (min_block_length_minutes is null or min_block_length_minutes between 0 and 60);
