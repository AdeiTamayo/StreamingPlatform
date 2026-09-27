-- StreamFlow Supabase Schema
-- Single canonical migration: all tables, indexes, RLS policies, and the
-- watched / watch_later unique indexes.
--
-- Tables: watched, watch_later, search_history.
-- Playback progress, the video source preference, and episode notifications
-- are local-only, so any legacy progress / settings / notifications tables
-- from older revisions are dropped first (no-op on fresh projects).

-- 0. DROP LEGACY LOCAL-ONLY TABLES
drop table if exists public.progress cascade;
drop table if exists public.settings cascade;
drop table if exists public.notifications cascade;

-- 1. WATCHED TABLE
create table if not exists public.watched (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  season integer,
  episode integer,
  watched_at timestamptz not null default now(),
  meta jsonb,

  constraint watched_pkey primary key (id)
);

create index if not exists idx_watched_user_id on public.watched using btree (user_id);
create index if not exists idx_watched_user_media on public.watched using btree (user_id, media_type);
create index if not exists idx_watched_user_tmdb on public.watched using btree (user_id, tmdb_id);
create index if not exists idx_watched_lookup on public.watched using btree (user_id, media_type, tmdb_id, season, episode);

-- Prevents duplicate watched rows when the same track is watched again.
create unique index if not exists watched_unique_track_idx
  on public.watched (user_id, media_type, tmdb_id, coalesce(season, -1), coalesce(episode, -1));

alter table public.watched enable row level security;

-- Drop-then-create keeps the file re-runnable (create policy has no
-- if-not-exists variant).
drop policy if exists "Users can view their own watched items" on public.watched;
drop policy if exists "Users can insert their own watched items" on public.watched;
drop policy if exists "Users can update their own watched items" on public.watched;
drop policy if exists "Users can delete their own watched items" on public.watched;

create policy "Users can view their own watched items"
  on public.watched for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watched items"
  on public.watched for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watched items"
  on public.watched for update
  using (auth.uid() = user_id);

create policy "Users can delete their own watched items"
  on public.watched for delete
  using (auth.uid() = user_id);

-- 2. WATCH_LATER TABLE
create table if not exists public.watch_later (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  year text,
  poster text,
  season integer,
  episode integer,
  created_at timestamptz not null default now(),

  constraint watch_later_pkey primary key (id)
);

create index if not exists idx_watch_later_user_id on public.watch_later using btree (user_id);
create index if not exists idx_watch_later_user_media on public.watch_later using btree (user_id, media_type);

-- Drop older duplicates, keeping the earliest row per track, so the unique
-- index below can be created on tables that already contain dupes.
-- (No-op on fresh projects.)
delete from public.watch_later a
using public.watch_later b
where a.id > b.id
  and a.user_id = b.user_id
  and a.media_type = b.media_type
  and a.tmdb_id = b.tmdb_id
  and coalesce(a.season, -1) = coalesce(b.season, -1)
  and coalesce(a.episode, -1) = coalesce(b.episode, -1);

-- Prevents duplicate watch-later rows for the same track (series-level vs
-- per-episode rows stay distinct via season/episode).
create unique index if not exists watch_later_unique_track_idx
  on public.watch_later (user_id, media_type, tmdb_id, coalesce(season, -1), coalesce(episode, -1));

alter table public.watch_later enable row level security;

drop policy if exists "Users can view their own watch later" on public.watch_later;
drop policy if exists "Users can insert their own watch later" on public.watch_later;
drop policy if exists "Users can delete their own watch later" on public.watch_later;

create policy "Users can view their own watch later"
  on public.watch_later for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watch later"
  on public.watch_later for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own watch later"
  on public.watch_later for delete
  using (auth.uid() = user_id);

-- 3. SEARCH_HISTORY TABLE
create table if not exists public.search_history (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now(),

  constraint search_history_pkey primary key (id)
);

create index if not exists idx_search_history_user_id on public.search_history using btree (user_id);
create index if not exists idx_search_history_created on public.search_history using btree (user_id, created_at desc);

alter table public.search_history enable row level security;

drop policy if exists "Users can view their own search history" on public.search_history;
drop policy if exists "Users can insert their own search history" on public.search_history;
drop policy if exists "Users can delete their own search history" on public.search_history;

create policy "Users can view their own search history"
  on public.search_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own search history"
  on public.search_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own search history"
  on public.search_history for delete
  using (auth.uid() = user_id);
