-- =============================================================================
-- Poker5O Database Schema
-- =============================================================================

-- ─── Profiles ─────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  nickname         text        not null unique,
  avatar_url       text        not null,
  avatar_is_preset boolean     not null default true,
  chips            int         not null default 0,
  wins             int         not null default 0,
  losses           int         not null default 0,
  draws            int         not null default 0,
  created_at       timestamptz not null default now()
);

alter table profiles
  add constraint nickname_format
  check (nickname ~ '^[a-zA-Z0-9_]{3,20}$');

alter table profiles
  add constraint chips_non_negative
  check (chips >= 0);

-- ─── Stake Options ────────────────────────────────────────────────────────────
-- Single source of truth for valid stake values.

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
  winner_id        uuid        references profiles(id),  -- null = draw
  is_draw          boolean     not null default false,
  player0_columns  int         not null default 0,       -- columns won by player0
  player1_columns  int         not null default 0,       -- columns won by player1
  column_results   jsonb       not null default '[]',    -- ColumnResult[]
  final_state      jsonb,                                -- full GameState snapshot
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

create index on games (player0_id);
create index on games (player1_id);
create index on games (started_at desc);

-- ─── Chip Transactions ────────────────────────────────────────────────────────
-- Full audit trail of every chip movement.

create type chip_tx_type as enum (
  'admin_credit',   -- admin loaded chips
  'game_win',       -- won a game
  'game_loss',      -- lost a game
  'game_draw'       -- draw — no chips exchanged (amount = 0)
);

create table if not exists chip_transactions (
  id          uuid            primary key default gen_random_uuid(),
  player_id   uuid            not null references profiles(id),
  amount      int             not null,   -- positive = credit, negative = debit
  type        chip_tx_type    not null,
  game_id     uuid            references games(id),
  admin_id    uuid            references auth.users(id),  -- set for admin_credit only
  balance_after int           not null,                   -- snapshot for auditing
  created_at  timestamptz     not null default now()
);

create index on chip_transactions (player_id, created_at desc);
create index on chip_transactions (game_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table profiles           enable row level security;
alter table games              enable row level security;
alter table chip_transactions  enable row level security;
alter table stake_options      enable row level security;

-- profiles: public read, own insert/update
create policy "profiles_select_public"  on profiles for select using (true);
create policy "profiles_insert_own"     on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"     on profiles for update using (auth.uid() = id);

-- stake_options: public read, no write from client
create policy "stake_options_select_public" on stake_options for select using (true);

-- games: players can read their own games
create policy "games_select_own"
  on games for select
  using (auth.uid() = player0_id or auth.uid() = player1_id);

-- chip_transactions: players can only read their own
create policy "chip_tx_select_own"
  on chip_transactions for select
  using (auth.uid() = player_id);

-- ─── Stored Procedure: settle_game ────────────────────────────────────────────
-- Called server-side (service role) to atomically:
--   1. Insert the game record
--   2. Transfer chips
--   3. Insert chip_transactions
--   4. Update wins/losses/draws on profiles
-- Using a function prevents partial updates if something fails mid-way.

create or replace function settle_game(
  p_room_id       text,
  p_player0_id    uuid,
  p_player1_id    uuid,
  p_stake         int,
  p_winner_id     uuid,     -- null if draw
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
  -- Insert game record
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
    -- Draw: no chips change, update draw counters
    update profiles set draws = draws + 1
      where id in (p_player0_id, p_player1_id);

    -- Record zero-amount draw transactions
    select chips into v_p0_balance from profiles where id = p_player0_id;
    select chips into v_p1_balance from profiles where id = p_player1_id;

    insert into chip_transactions (player_id, amount, type, game_id, balance_after)
    values
      (p_player0_id, 0, 'game_draw', v_game_id, v_p0_balance),
      (p_player1_id, 0, 'game_draw', v_game_id, v_p1_balance);

  else
    -- Transfer chips from loser to winner
    declare
      v_loser_id uuid := case when p_winner_id = p_player0_id then p_player1_id else p_player0_id end;
    begin
      update profiles set
        chips  = chips - p_stake,
        losses = losses + 1
      where id = v_loser_id;

      update profiles set
        chips = chips + p_stake,
        wins  = wins + 1
      where id = p_winner_id;

      select chips into v_p0_balance from profiles where id = p_player0_id;
      select chips into v_p1_balance from profiles where id = p_player1_id;

      insert into chip_transactions (player_id, amount, type, game_id, balance_after)
      values
        (p_winner_id, p_stake,    'game_win',  v_game_id,
          case when p_winner_id = p_player0_id then v_p0_balance else v_p1_balance end),
        (v_loser_id,  -p_stake,   'game_loss', v_game_id,
          case when v_loser_id = p_player0_id then v_p0_balance else v_p1_balance end);
    end;
  end if;

  return v_game_id;
end;
$$;

-- ─── Storage: avatars bucket ──────────────────────────────────────────────────
-- Run in Supabase dashboard > Storage, or via Supabase CLI:
--
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
--
-- create policy "avatars_presets_read"   on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'presets/%');
-- create policy "avatars_uploads_read"   on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'uploads/%');
-- create policy "avatars_uploads_insert" on storage.objects for insert
--   with check (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');
-- create policy "avatars_uploads_update" on storage.objects for update
--   using (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');
