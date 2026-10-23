-- Dynasty Futures — Supabase schema. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS).
-- Public data (value snapshots, league trades) is readable by anyone and written only by our server
-- (secret key, which bypasses row-level security). Personal data is visible only to its owner.

-- ---------- Daily value snapshots (pick appreciation, long value history) ----------
create table if not exists public.value_snapshots (
  snapshot_date date not null,
  format text not null,              -- e.g. '1qb-half-te0' / 'sf-ppr-te0.5'
  player_key text not null,          -- sleeper id (or 'mfl:<id>' when no sleeper id)
  name text,
  position text,
  value integer not null,            -- Futures Value
  model integer, market integer, experts integer,
  primary key (snapshot_date, format, player_key)
);
create index if not exists value_snapshots_player on public.value_snapshots (format, player_key, snapshot_date desc);

create table if not exists public.pick_snapshots (
  snapshot_date date not null,
  format text not null,
  year integer not null,
  round integer not null,
  tier text not null default 'Mid',  -- Early / Mid / Late
  value integer not null,
  primary key (snapshot_date, format, year, round, tier)
);

-- ---------- Real trades across all synced leagues (market data) ----------
create table if not exists public.league_trades (
  platform text not null,
  league_id text not null,
  trade_id text not null,
  traded_at timestamptz not null,
  season integer not null,
  league_format text,                 -- same format key as snapshots
  sides jsonb not null,               -- [{team_id, received:[{kind,id|year,round}]}]
  primary key (platform, trade_id)
);
create index if not exists league_trades_time on public.league_trades (traded_at desc);

-- ---------- Accounts: saved leagues, player tags, alerts, offline draft ledger ----------
create table if not exists public.user_leagues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('sleeper', 'mfl', 'espn', 'fleaflicker', 'ffpc', 'yahoo')),
  league_id text not null,
  franchise_id text,
  league_name text,
  team_name text,
  username text,                      -- Sleeper username only; never passwords or API keys
  created_at timestamptz not null default now(),
  unique (user_id, platform, league_id)
);

create table if not exists public.player_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  player_key text not null,
  tag text not null check (tag in ('untouchable', 'premium', 'available', 'target')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, player_key)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                 -- 'value_move' | 'buy_low' | 'sell_high' | 'league_trade' | ...
  title text not null,
  body text,
  data jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists alerts_user on public.alerts (user_id, created_at desc);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                 -- 'player_move' | 'my_players' | 'league_trades'
  player_key text,
  threshold numeric,                  -- e.g. 0.10 = 10% move
  created_at timestamptz not null default now()
);

create table if not exists public.draft_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  league_id text not null,
  year integer not null,
  round integer not null,
  pick integer,                        -- slot within round, if known
  original_team_id text,
  owner_team_id text,
  player_key text,                     -- who was taken (offline drafts)
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists draft_ledger_league on public.draft_ledger (user_id, platform, league_id, year);

-- Private notebook and personal value adjustments (owner-only).
create table if not exists public.user_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_rules_user on public.user_rules (user_id, updated_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  value_adjustments jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
alter table public.value_snapshots enable row level security;
alter table public.pick_snapshots  enable row level security;
alter table public.league_trades   enable row level security;
alter table public.user_leagues    enable row level security;
alter table public.player_tags     enable row level security;
alter table public.alerts          enable row level security;
alter table public.alert_rules     enable row level security;
alter table public.draft_ledger    enable row level security;
alter table public.user_rules      enable row level security;
alter table public.user_settings   enable row level security;

do $$
begin
  -- Public read for market data
  if not exists (select 1 from pg_policies where policyname = 'read value_snapshots') then
    create policy "read value_snapshots" on public.value_snapshots for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'read pick_snapshots') then
    create policy "read pick_snapshots" on public.pick_snapshots for select using (true);
  end if;
  -- Owner-only for personal data
  if not exists (select 1 from pg_policies where policyname = 'own user_leagues') then
    create policy "own user_leagues" on public.user_leagues for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own player_tags') then
    create policy "own player_tags" on public.player_tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own alerts') then
    create policy "own alerts" on public.alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own alert_rules') then
    create policy "own alert_rules" on public.alert_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own draft_ledger') then
    create policy "own draft_ledger" on public.draft_ledger for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own user_rules') then
    create policy "own user_rules" on public.user_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own user_settings') then
    create policy "own user_settings" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
-- league_trades has no public policy: only the server reads/writes it.
