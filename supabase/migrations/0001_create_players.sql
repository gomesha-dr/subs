-- Players table: persistent profile per squad member.
-- Each player has a single row; per-match overrides will live in a separate table later.

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_position text not null check (primary_position in ('attack', 'midfield', 'defence')),
  secondary_position text check (secondary_position in ('attack', 'midfield', 'defence')),
  max_block_minutes integer not null default 20 check (max_block_minutes between 1 and 120),
  max_total_minutes integer not null default 60 check (max_total_minutes between 1 and 120),
  skill_score smallint not null default 5 check (skill_score between 1 and 10),
  is_goalkeeper boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secondary_differs_from_primary
    check (secondary_position is null or secondary_position <> primary_position),
  constraint total_at_least_block
    check (max_total_minutes >= max_block_minutes)
);

-- Case-insensitive uniqueness on name: "Mike" and "mike" can't both exist.
create unique index players_name_lower_idx on public.players (lower(name));

-- Auto-update updated_at on every UPDATE.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

-- Enable RLS. We won't add policies because all access goes through the server
-- using the SECRET key, which bypasses RLS. This blocks any accidental
-- direct-from-browser access via the publishable key.
alter table public.players enable row level security;
