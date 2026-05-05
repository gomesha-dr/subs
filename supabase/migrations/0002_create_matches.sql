-- Matches: a scheduled fixture, with optional time, duration, and goalkeeper.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  match_time time,
  duration_minutes integer not null default 80 check (duration_minutes between 1 and 240),
  half_length_minutes integer not null default 40 check (half_length_minutes between 1 and 120),
  goalkeeper_id uuid references public.players(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint half_fits_in_match check (half_length_minutes <= duration_minutes)
);

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

-- Match attendances: who's coming, plus optional per-match overrides of profile fields.
-- Override columns are written but not yet exposed in the v1 UI.
create table public.match_attendances (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_attending boolean not null default false,
  override_primary_position text
    check (override_primary_position is null or override_primary_position in ('attack', 'midfield', 'defence')),
  override_secondary_position text
    check (override_secondary_position is null or override_secondary_position in ('attack', 'midfield', 'defence')),
  override_max_block_minutes integer
    check (override_max_block_minutes is null or override_max_block_minutes between 1 and 240),
  override_max_total_minutes integer
    check (override_max_total_minutes is null or override_max_total_minutes between 1 and 240),
  override_skill_score smallint
    check (override_skill_score is null or override_skill_score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  constraint override_total_at_least_block check (
    override_max_total_minutes is null or override_max_block_minutes is null
    or override_max_total_minutes >= override_max_block_minutes
  ),
  constraint override_secondary_differs check (
    override_secondary_position is null or override_primary_position is null
    or override_secondary_position <> override_primary_position
  )
);

create trigger match_attendances_set_updated_at
before update on public.match_attendances
for each row execute function public.set_updated_at();

create index match_attendances_match_idx on public.match_attendances (match_id);
create index match_attendances_player_idx on public.match_attendances (player_id);
create index matches_date_idx on public.matches (match_date);

alter table public.matches enable row level security;
alter table public.match_attendances enable row level security;
