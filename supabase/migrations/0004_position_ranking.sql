-- Add ranked position preferences (1st, 2nd, 3rd choice) replacing the
-- primary/secondary model. Old columns are preserved in this migration
-- for backwards compatibility; a later migration drops them.

alter table public.players
  add column pref_1_position text check (pref_1_position in ('attack', 'midfield', 'defence')),
  add column pref_2_position text check (pref_2_position in ('attack', 'midfield', 'defence')),
  add column pref_3_position text check (pref_3_position in ('attack', 'midfield', 'defence'));

-- Backfill from primary/secondary using a sensible default for the third spot.
update public.players
set
  pref_1_position = primary_position,
  pref_2_position = case
    when secondary_position is not null then secondary_position
    when primary_position = 'attack' then 'midfield'
    when primary_position = 'midfield' then 'attack'
    when primary_position = 'defence' then 'midfield'
  end,
  pref_3_position = case
    when secondary_position is not null then
      case primary_position || '|' || secondary_position
        when 'attack|midfield' then 'defence'
        when 'attack|defence' then 'midfield'
        when 'midfield|attack' then 'defence'
        when 'midfield|defence' then 'attack'
        when 'defence|attack' then 'midfield'
        when 'defence|midfield' then 'attack'
      end
    else
      case primary_position
        when 'attack' then 'defence'
        when 'midfield' then 'defence'
        when 'defence' then 'attack'
      end
  end;

alter table public.players
  alter column pref_1_position set not null,
  alter column pref_2_position set not null,
  alter column pref_3_position set not null;

alter table public.players
  add constraint preferences_distinct check (
    pref_1_position <> pref_2_position
    and pref_1_position <> pref_3_position
    and pref_2_position <> pref_3_position
  );
