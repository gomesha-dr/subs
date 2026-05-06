-- Add formation and generated schedule columns to matches.
-- Formation is a "def-mid-att" string like "1-3-2"; the three numbers must sum to 6 in 7-a-side.
-- generated_schedule holds the scheduler output as JSON for persistence and captain edits.

alter table public.matches
  add column formation text
    check (formation is null or formation ~ '^[0-9]+-[0-9]+-[0-9]+$'),
  add column generated_schedule jsonb;

comment on column public.matches.formation is
  'Outfield formation as "def-mid-att" string (sums to 6 in 7-a-side). Null until scheduler runs.';
comment on column public.matches.generated_schedule is
  'JSON output of the scheduler: list of (player_id, position, start_slot, end_slot) blocks plus metadata.';
