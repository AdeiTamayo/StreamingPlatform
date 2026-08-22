-- StreamFlow Supabase Schema
-- Initial schema: all tables, indexes, RLS policies, and the watched unique index

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

-- 2. PROGRESS TABLE
create table if not exists public.progress (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  season integer,
  episode integer,
  current_time numeric not null default 0,
  duration numeric,
  meta jsonb,
  updated_at timestamptz not null default now(),

  constraint progress_pkey primary key (id)
);

-- Expression-based uniqueness (NULLs treated as equal) cannot be a plain
-- UNIQUE table constraint in PostgreSQL (only column lists allowed there).
-- Use an EXCLUDE constraint instead - still targetable by
-- ON CONFLICT ON CONSTRAINT in upserts.
alter table public.progress drop constraint if exists progress_unique_track;
alter table public.progress add constraint progress_unique_track
  exclude using btree (user_id with =, media_type with =, tmdb_id with =, coalesce(season, -1) with =, coalesce(episode, -1) with =);

create index if not exists idx_progress_user_id on public.progress using btree (user_id);
create index if not exists idx_progress_user_tmdb on public.progress using btree (user_id, tmdb_id);
create index if not exists idx_progress_updated on public.progress using btree (user_id, updated_at desc);

alter table public.progress enable row level security;

create policy "Users can view their own progress"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.progress for update
  using (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.progress for delete
  using (auth.uid() = user_id);

-- 3. WATCH_LATER TABLE
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

alter table public.watch_later enable row level security;

create policy "Users can view their own watch later"
  on public.watch_later for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watch later"
  on public.watch_later for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own watch later"
  on public.watch_later for delete
  using (auth.uid() = user_id);

-- 4. NOTIFICATIONS TABLE
create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text,
  media_type text check (media_type in ('movie', 'tv')),
  tmdb_id integer,
  season integer,
  episode integer,
  read boolean not null default false,
  created_at timestamptz not null default now(),

  constraint notifications_pkey primary key (id)
);

create index if not exists idx_notifications_user_id on public.notifications using btree (user_id);
create index if not exists idx_notifications_read on public.notifications using btree (user_id, read);
create index if not exists idx_notifications_created on public.notifications using btree (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notifications"
  on public.notifications for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- 5. SEARCH_HISTORY TABLE
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

create policy "Users can view their own search history"
  on public.search_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own search history"
  on public.search_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own search history"
  on public.search_history for delete
  using (auth.uid() = user_id);

-- 6. SETTINGS TABLE
create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  preferred_video_source text not null default 'vidsrc',
  updated_at timestamptz not null default now(),

  constraint settings_pkey primary key (user_id)
);

alter table public.settings enable row level security;

create policy "Users can view their own settings"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on public.settings for update
  using (auth.uid() = user_id);
