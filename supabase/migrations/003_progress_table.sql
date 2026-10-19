-- 3. PROGRESS TABLE
-- Continue Watching cross-device metadata: which media is being watched.
-- Playback position (current_time) is deliberately NOT stored - resume points
-- stay in each browser's localStorage.

create table if not exists public.progress (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null default '',
  poster text,
  season integer,
  episode integer,
  updated_at timestamptz not null default now(),

  constraint progress_pkey primary key (id)
);

create index if not exists idx_progress_user_id on public.progress using btree (user_id);
create index if not exists idx_progress_user_media on public.progress using btree (user_id, media_type);

-- Drop older duplicates, keeping the earliest row per track, so the unique
-- index below can be created on tables that already contain dupes.
-- (No-op on fresh projects.)
delete from public.progress a
using public.progress b
where a.id > b.id
  and a.user_id = b.user_id
  and a.media_type = b.media_type
  and a.tmdb_id = b.tmdb_id
  and coalesce(a.season, -1) = coalesce(b.season, -1)
  and coalesce(a.episode, -1) = coalesce(b.episode, -1);

-- One row per track. The coalesce expressions keep NULL season/episode
-- (movies, series-level) from defeating uniqueness.
create unique index if not exists progress_unique_track_idx
  on public.progress (user_id, media_type, tmdb_id, coalesce(season, -1), coalesce(episode, -1));

alter table public.progress enable row level security;

drop policy if exists "Users can view their own progress" on public.progress;
drop policy if exists "Users can insert their own progress" on public.progress;
drop policy if exists "Users can update their own progress" on public.progress;
drop policy if exists "Users can delete their own progress" on public.progress;

create policy "Users can view their own progress"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.progress for delete
  using (auth.uid() = user_id);
