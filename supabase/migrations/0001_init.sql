-- Team Dice Race: initial schema.
-- Security model: RLS is enabled on every table with NO policies, so the anon key
-- can read and write nothing directly. All reads and writes go through Edge
-- Functions using the service role, which filter out hidden information
-- (unrevealed trap doors, WYR answers, unresolved rolls, other players' lock-ins).

create extension if not exists pgcrypto;

-- Seasons ---------------------------------------------------------------------
create table seasons (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  start_date    date not null,                 -- first game date (Australia/Sydney)
  status        text not null default 'setup'  -- setup | active | finished
                check (status in ('setup', 'active', 'finished')),
  paused        boolean not null default false,
  board_size    int  not null default 100 check (board_size between 20 and 300),
  config        jsonb not null default '{"swapEnabled": false, "devilsDealOfferRate": 0.125}',
  winner_player_id uuid,
  created_at    timestamptz not null default now()
);
-- Only one season can be live at a time.
create unique index one_active_season on seasons ((true)) where status in ('setup', 'active');

-- Players ---------------------------------------------------------------------
create table players (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references seasons(id) on delete cascade,
  nickname         text not null check (char_length(nickname) between 1 and 24),
  avatar_key       text not null default 'placeholder_1',
  key_hash         text not null unique,          -- sha256 of the personal link key, hex
  position         int  not null default 0,       -- 0 start, 1..board_size, > board_size finished
  in_hell          boolean not null default false,
  hell_visits      int  not null default 0,
  devil_marked     boolean not null default false,
  held_powerup     text check (held_powerup in ('double_dice', 'shield', 'lucky_roll', 'swap')),
  curse            jsonb,                          -- {"kind": "lame_steer", "daysLeft": 2}
  streak           int  not null default 0,
  pending_decision jsonb,                          -- PendingDecision; WYR answer is never stored here
  bonus_rolls      int  not null default 0 check (bonus_rolls >= 0),
  next_roll        text check (next_roll in ('cpi', 'glass_ceiling')), -- set by a hidden square, applies to the next main move
  finished_on      date,
  sort_order       int  not null default 0,
  unique (season_id, nickname)
);

-- Board -----------------------------------------------------------------------
create table squares (
  season_id uuid not null references seasons(id) on delete cascade,
  idx       int  not null check (idx >= 1),
  type      text not null check (type in ('normal', 'trap', 'boost', 'survey', 'powerup', 'decision')),
  payload   jsonb,                                 -- trap: {"drop": 7, "text": "Missed your KPIs"}, boost: {"gain": 4, "text": "R&R award"}, either may carry an "effect"
  revealed  boolean not null default true,         -- false for trap doors and good surprises until landed on
  primary key (season_id, idx)
);

-- Lock-ins (one per player per game date, immutable once made) -----------------
create table lock_ins (
  season_id       uuid not null references seasons(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  game_date       date not null,
  play_powerup    boolean not null default false,
  decision_choice jsonb,                           -- {"choice": "wyr", "wyrPick": "a"} or {"choice": "pass"}
  created_at      timestamptz not null default now(),
  primary key (player_id, game_date)
);
create index lock_ins_by_date on lock_ins (season_id, game_date);

-- Daily events (pre-generated at season setup) --------------------------------
create table daily_events (
  season_id uuid not null references seasons(id) on delete cascade,
  game_date date not null,
  event_key text not null,
  primary key (season_id, game_date)
);

-- Resolutions: one row per game date, which is what makes resolution idempotent
create table resolutions (
  season_id   uuid not null references seasons(id) on delete cascade,
  game_date   date not null,
  status      text not null check (status in ('resolved', 'skipped')),
  seed        text,                                -- crypto-random seed used, for audit and re-render
  resolved_at timestamptz not null default now(),
  primary key (season_id, game_date)
);

-- Event log: the replay is rendered entirely from this ------------------------
create table event_log (
  id        bigint generated always as identity primary key,
  season_id uuid not null references seasons(id) on delete cascade,
  game_date date not null,
  seq       int  not null,
  player_id uuid references players(id) on delete cascade,
  kind      text not null,
  data      jsonb not null default '{}',
  unique (season_id, game_date, seq)
);

-- Would You Rather (entered through the admin view, never in the repo) --------
create table wyr_questions (
  id             uuid primary key default gen_random_uuid(),
  question       text not null,
  option_a       text not null,
  option_b       text not null,
  answer         char(1) not null check (answer in ('a', 'b')),
  used_season_id uuid references seasons(id) on delete set null,
  used_date      date,
  created_at     timestamptz not null default now()
);

-- Hall of Fame (survives season resets) ---------------------------------------
create table hall_of_fame (
  id              bigint generated always as identity primary key,
  season_id       uuid references seasons(id) on delete set null,
  season_name     text not null,
  award           text not null,
  player_nickname text not null,
  detail          text,
  published       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Host --------------------------------------------------------------------------
create table admin (
  id       int primary key default 1 check (id = 1),   -- single host
  key_hash text not null
);

-- Rate limiting for lock-in and admin endpoints --------------------------------
create table rate_limits (
  bucket       text not null,                     -- e.g. 'lockin:<key_hash>' or 'admin:<ip>'
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);

-- Lock everything down: RLS on, no policies, so anon/authenticated get nothing.
alter table seasons       enable row level security;
alter table players       enable row level security;
alter table squares       enable row level security;
alter table lock_ins      enable row level security;
alter table daily_events  enable row level security;
alter table resolutions   enable row level security;
alter table event_log     enable row level security;
alter table wyr_questions enable row level security;
alter table hall_of_fame  enable row level security;
alter table admin         enable row level security;
alter table rate_limits   enable row level security;
revoke all on all tables in schema public from anon, authenticated;
