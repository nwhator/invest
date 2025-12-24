-- Minimal schema for odds ingestion + predictions.
-- Run this in Supabase SQL editor.

-- Extensions (gen_random_uuid)
create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),

  sport_key text not null,
  league_key text,

  commence_time_utc timestamptz not null,
  home_name text not null,
  away_name text not null,

  odds_provider text not null,
  odds_provider_event_id text not null,

  status text not null default 'scheduled',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists events_provider_event_id_uniq
  on public.events (odds_provider, odds_provider_event_id);

create index if not exists events_commence_time_idx
  on public.events (commence_time_utc);

create index if not exists events_sport_key_idx
  on public.events (sport_key);

create table if not exists public.odds_snapshots (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,

  provider text not null,
  bookmaker text not null,

  market_key text not null,        -- h2h | spreads | totals | 1x2 ...
  outcome_key text not null,       -- home | away | draw | over | under
  outcome_name text,

  line numeric,                    -- handicap/total line (nullable)
  price numeric not null,          -- decimal odds by default

  snapshot_time_utc timestamptz not null,

  raw jsonb,

  created_at timestamptz not null default now()
);

create index if not exists odds_snapshots_event_time_idx
  on public.odds_snapshots (event_id, snapshot_time_utc desc);

create index if not exists odds_snapshots_snapshot_time_idx
  on public.odds_snapshots (snapshot_time_utc desc);

create index if not exists odds_snapshots_market_idx
  on public.odds_snapshots (market_key);

-- Helpful for spreads/handicap scanning (market + line lookup)
create index if not exists odds_snapshots_market_line_idx
  on public.odds_snapshots (market_key, line);

-- Helpful for scanning latest odds for a market per event
create index if not exists odds_snapshots_event_market_time_idx
  on public.odds_snapshots (event_id, market_key, snapshot_time_utc desc);

create table if not exists public.results (
  event_id uuid primary key references public.events(id) on delete cascade,

  home_score int,
  away_score int,
  winner_key text, -- home | away | draw

  final_time_utc timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists results_final_time_idx
  on public.results (final_time_utc);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,

  market_key text not null,
  outcome_key text not null,
  line numeric,

  model_version text not null,
  predicted_prob numeric not null,

  generated_time_utc timestamptz not null,

  created_at timestamptz not null default now()
);

create index if not exists predictions_event_time_idx
  on public.predictions (event_id, generated_time_utc desc);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,

  friend_name text not null,

  market_key text not null,        -- h2h | spreads | totals
  outcome_key text not null,       -- home/away/draw/over/under or normalized name
  outcome_name text,
  line numeric,
  odds_price_used numeric not null,

  stake numeric not null default 1,
  placed_time_utc timestamptz not null default now(),

  settlement text,                 -- win | lose | push | half_win | half_lose (nullable until settled)
  payout numeric,

  created_at timestamptz not null default now()
);

create index if not exists bets_event_time_idx
  on public.bets (event_id, placed_time_utc desc);

-- Optional: keep updated_at current
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();
