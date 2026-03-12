-- ─── Profiles ──────────────────────────────────────────────────────────────────
-- One row per authenticated user, created during onboarding.

create table if not exists profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  nickname        text        not null unique,
  avatar_url      text        not null,
  avatar_is_preset boolean    not null default true,
  wins            int         not null default 0,
  losses          int         not null default 0,
  created_at      timestamptz not null default now()
);

-- Nickname must be 3-20 chars, alphanumeric + underscores only
alter table profiles
  add constraint nickname_format
  check (nickname ~ '^[a-zA-Z0-9_]{3,20}$');

-- ─── Row Level Security ─────────────────────────────────────────────────────────

alter table profiles enable row level security;

-- Anyone can read any profile (needed for lobby player list)
create policy "profiles_select_public"
  on profiles for select
  using (true);

-- Users can only insert their own profile
create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

-- Users can only update their own profile (avatar only — nickname locked)
create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── Storage: avatars bucket ────────────────────────────────────────────────────
-- Run this in the Supabase dashboard Storage section, or via the Supabase CLI.
--
-- insert into storage.buckets (id, name, public)
-- values ('avatars', 'avatars', true);
--
-- Preset avatars (read-only for all):
-- create policy "avatars_presets_public_read" on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'presets/%');
--
-- Users can upload/overwrite only their own file:
-- create policy "avatars_uploads_own_write" on storage.objects for insert
--   with check (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');
-- create policy "avatars_uploads_own_update" on storage.objects for update
--   using (bucket_id = 'avatars' and name = 'uploads/' || auth.uid() || '.webp');
-- create policy "avatars_uploads_public_read" on storage.objects for select
--   using (bucket_id = 'avatars' and name like 'uploads/%');
