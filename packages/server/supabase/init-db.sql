-- =============================================================================
-- Poker5O — Full Database Initialization Script
-- Run this once against a fresh Supabase project (SQL Editor > Run).
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT DO NOTHING.
-- =============================================================================

-- ─── Profiles ─────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  nickname         text        not null unique,
  avatar_url       text        not null,
  avatar_is_preset boolean     not null default true,
  chips            int         not null default 100,
  wins             int         not null default 0,
  losses           int         not null default 0,
  draws            int         not null default 0,
  created_at       timestamptz not null default now(),
  role             text        not null default 'user' check (role in ('admin', 'agent', 'user', 'bot')),
  agent_id         uuid        references profiles(id),
  agent_chip_pool  int         not null default 0 check (agent_chip_pool >= 0)
);

alter table profiles
  add constraint if not exists nickname_format
  check (nickname ~ '^[a-zA-Z0-9_]{3,20}$');

alter table profiles
  add constraint if not exists chips_non_negative
  check (chips >= 0);

-- ─── Stake Options ────────────────────────────────────────────────────────────

create table if not exists stake_options (
  amount int primary key
);

insert into stake_options (amount) values
  (10), (50), (100), (250), (500), (1000), (2000), (3000), (4000), (5000)
on conflict do nothing;

-- ─── Games ────────────────────────────────────────────────────────────────────

create table if not exists games (
  id               uuid        primary key default gen_random_uuid(),
  room_id          text        not null,
  player0_id       uuid        not null references profiles(id),
  player1_id       uuid        not null references profiles(id),
  stake            int         not null references stake_options(amount),
  winner_id        uuid        references profiles(id),
  is_draw          boolean     not null default false,
  player0_columns  int         not null default 0,
  player1_columns  int         not null default 0,
  column_results   jsonb       not null default '[]',
  final_state      jsonb,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

create index if not exists profiles_role_idx     on profiles (role);
create index if not exists profiles_agent_id_idx on profiles (agent_id);

create index if not exists games_player0_id_idx on games (player0_id);
create index if not exists games_player1_id_idx on games (player1_id);
create index if not exists games_started_at_idx on games (started_at desc);

-- ─── Chip Transactions ────────────────────────────────────────────────────────

do $$ begin
  create type chip_tx_type as enum (
    'admin_credit',
    'game_win',
    'game_loss',
    'game_draw'
  );
exception when duplicate_object then null;
end $$;

create table if not exists chip_transactions (
  id            uuid          primary key default gen_random_uuid(),
  player_id     uuid          not null references profiles(id),
  amount        int           not null,
  type          chip_tx_type  not null,
  game_id       uuid          references games(id),
  admin_id      uuid          references auth.users(id),
  balance_after int           not null,
  created_at    timestamptz   not null default now()
);

create index if not exists chip_tx_player_idx on chip_transactions (player_id, created_at desc);
create index if not exists chip_tx_game_idx   on chip_transactions (game_id);

-- ─── Chip Requests ────────────────────────────────────────────────────────────

do $$ begin
  create type chip_request_status as enum ('pending', 'approved', 'declined');
exception when duplicate_object then null;
end $$;

create table if not exists chip_requests (
  id           uuid                 primary key default gen_random_uuid(),
  player_id    uuid                 not null references profiles(id) on delete cascade,
  amount       int                  not null check (amount > 0),
  note         text,
  status       chip_request_status  not null default 'pending',
  resolved_at  timestamptz,
  created_at   timestamptz          not null default now()
);

create index if not exists chip_requests_player_idx on chip_requests (player_id, created_at desc);
create index if not exists chip_requests_status_idx on chip_requests (status, created_at asc);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table profiles           enable row level security;
alter table games              enable row level security;
alter table chip_transactions  enable row level security;
alter table stake_options      enable row level security;
alter table chip_requests      enable row level security;

-- profiles
do $$ begin
  create policy "profiles_select_public" on profiles for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
exception when duplicate_object then null;
end $$;

-- stake_options
do $$ begin
  create policy "stake_options_select_public" on stake_options for select using (true);
exception when duplicate_object then null;
end $$;

-- games
do $$ begin
  create policy "games_select_own" on games for select
    using (auth.uid() = player0_id or auth.uid() = player1_id);
exception when duplicate_object then null;
end $$;

-- chip_transactions
do $$ begin
  create policy "chip_tx_select_own" on chip_transactions for select
    using (auth.uid() = player_id);
exception when duplicate_object then null;
end $$;

-- chip_requests
do $$ begin
  create policy "chip_requests_select_own" on chip_requests for select
    using (auth.uid() = player_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "chip_requests_insert_own" on chip_requests for insert
    with check (auth.uid() = player_id);
exception when duplicate_object then null;
end $$;

-- ─── Stored Procedure: settle_game ────────────────────────────────────────────

create or replace function settle_game(
  p_room_id       text,
  p_player0_id    uuid,
  p_player1_id    uuid,
  p_stake         int,
  p_winner_id     uuid,
  p_is_draw       boolean,
  p_p0_columns    int,
  p_p1_columns    int,
  p_column_results jsonb,
  p_final_state   jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_game_id   uuid;
  v_p0_balance int;
  v_p1_balance int;
begin
  insert into games (
    room_id, player0_id, player1_id, stake,
    winner_id, is_draw, player0_columns, player1_columns,
    column_results, final_state, ended_at
  ) values (
    p_room_id, p_player0_id, p_player1_id, p_stake,
    p_winner_id, p_is_draw, p_p0_columns, p_p1_columns,
    p_column_results, p_final_state, now()
  ) returning id into v_game_id;

  if p_is_draw then
    update profiles set draws = draws + 1
      where id in (p_player0_id, p_player1_id);

    select chips into v_p0_balance from profiles where id = p_player0_id;
    select chips into v_p1_balance from profiles where id = p_player1_id;

    insert into chip_transactions (player_id, amount, type, game_id, balance_after)
    values
      (p_player0_id, 0, 'game_draw', v_game_id, v_p0_balance),
      (p_player1_id, 0, 'game_draw', v_game_id, v_p1_balance);

  else
    declare
      v_loser_id uuid := case when p_winner_id = p_player0_id then p_player1_id else p_player0_id end;
    begin
      update profiles set chips = chips - p_stake, losses = losses + 1 where id = v_loser_id;
      update profiles set chips = chips + p_stake, wins   = wins   + 1 where id = p_winner_id;

      select chips into v_p0_balance from profiles where id = p_player0_id;
      select chips into v_p1_balance from profiles where id = p_player1_id;

      insert into chip_transactions (player_id, amount, type, game_id, balance_after)
      values
        (p_winner_id, p_stake,  'game_win',  v_game_id,
          case when p_winner_id = p_player0_id then v_p0_balance else v_p1_balance end),
        (v_loser_id, -p_stake,  'game_loss', v_game_id,
          case when v_loser_id = p_player0_id then v_p0_balance else v_p1_balance end);
    end;
  end if;

  return v_game_id;
end;
$$;

-- ─── Stored Procedure: add_chips ──────────────────────────────────────────────

create or replace function add_chips(p_player_id uuid, p_amount int)
returns void
language plpgsql
security definer
as $$
begin
  update profiles set chips = chips + p_amount where id = p_player_id;
end;
$$;

-- ─── Stored Procedures: Agent chip transfers ──────────────────────────────────

create or replace function agent_credit_player(
  p_agent_id  uuid,
  p_player_id uuid,
  p_amount    int
) returns void
language plpgsql security definer as $$
begin
  update profiles set agent_chip_pool = agent_chip_pool - p_amount where id = p_agent_id;
  update profiles set chips = chips + p_amount where id = p_player_id;
end;
$$;

create or replace function agent_debit_player(
  p_agent_id  uuid,
  p_player_id uuid,
  p_amount    int
) returns void
language plpgsql security definer as $$
begin
  update profiles set chips = chips - p_amount where id = p_player_id;
  update profiles set agent_chip_pool = agent_chip_pool + p_amount where id = p_agent_id;
end;
$$;

-- ─── Storage: avatars bucket ──────────────────────────────────────────────────
-- Run these manually in Supabase Dashboard > Storage, or via CLI:
--
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
--   on conflict do nothing;
--
-- create policy "avatars_presets_read" on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'presets/%');
-- create policy "avatars_uploads_read" on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'uploads/%');
-- create policy "avatars_uploads_insert" on storage.objects for insert
--   with check (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');
-- create policy "avatars_uploads_update" on storage.objects for update
--   using (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');

-- =============================================================================
-- Done. Verify with:
--   select table_name from information_schema.tables where table_schema = 'public';
-- =============================================================================
