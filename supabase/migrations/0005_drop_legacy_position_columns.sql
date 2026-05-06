-- Drop the legacy primary_position and secondary_position columns from players.
-- They were superseded by pref_1_position / pref_2_position / pref_3_position in
-- migration 0004, but kept in place for safety while the codebase migrated. The
-- NOT NULL constraint on primary_position broke new player inserts (the app no
-- longer writes to these columns), so we remove them now.

alter table public.players
  drop constraint if exists secondary_differs_from_primary,
  drop column if exists primary_position,
  drop column if exists secondary_position;
