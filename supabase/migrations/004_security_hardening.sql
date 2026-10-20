-- 4. SECURITY HARDENING
-- Applied as a new migration because 001/003 may already have run in
-- production: editing an applied migration does not update existing projects.
--
-- This migration:
--   1. Recreates UPDATE policies with a matching WITH CHECK (prevents moving a
--      row to another user_id).
--   2. Adds write-size / shape constraints. They are NOT VALID so legacy rows
--      cannot fail the migration, but every new insert/update is checked.
--   3. Adds per-user row caps so an authenticated client cannot fill the
--      database by bypassing the client-side limits.
--   4. Revokes table access from the anon role; only authenticated users with
--      RLS can read/write.

-- 1. UPDATE POLICIES: USING + WITH CHECK
drop policy if exists "Users can update their own watched items" on public.watched;
create policy "Users can update their own watched items"
  on public.watched for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own watch later" on public.watch_later;
create policy "Users can update their own watch later"
  on public.watch_later for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own search history" on public.search_history;
create policy "Users can update their own search history"
  on public.search_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own progress" on public.progress;
create policy "Users can update their own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. WRITE CONSTRAINTS
alter table public.watched drop constraint if exists watched_title_len;
alter table public.watched add constraint watched_title_len
  check (char_length(title) <= 300) not valid;

alter table public.watched drop constraint if exists watched_meta_bytes;
alter table public.watched add constraint watched_meta_bytes
  check (meta is null or pg_column_size(meta) <= 16384) not valid;

alter table public.watched drop constraint if exists watched_ids_valid;
alter table public.watched add constraint watched_ids_valid
  check (
    tmdb_id > 0
    and (season is null or season >= 0)
    and (episode is null or episode >= 0)
  ) not valid;

alter table public.watched drop constraint if exists watched_track_shape;
alter table public.watched add constraint watched_track_shape
  check (
    (media_type = 'movie' and season is null and episode is null)
    or (media_type = 'tv' and ((season is null) = (episode is null)))
  ) not valid;

alter table public.watch_later drop constraint if exists watch_later_title_len;
alter table public.watch_later add constraint watch_later_title_len
  check (char_length(title) <= 300) not valid;

alter table public.watch_later drop constraint if exists watch_later_year_len;
alter table public.watch_later add constraint watch_later_year_len
  check (year is null or char_length(year) <= 10) not valid;

alter table public.watch_later drop constraint if exists watch_later_poster_len;
alter table public.watch_later add constraint watch_later_poster_len
  check (poster is null or char_length(poster) <= 500) not valid;

alter table public.watch_later drop constraint if exists watch_later_ids_valid;
alter table public.watch_later add constraint watch_later_ids_valid
  check (
    tmdb_id > 0
    and (season is null or season >= 0)
    and (episode is null or episode >= 0)
  ) not valid;

alter table public.watch_later drop constraint if exists watch_later_track_shape;
alter table public.watch_later add constraint watch_later_track_shape
  check (
    (media_type = 'movie' and season is null and episode is null)
    or (media_type = 'tv' and ((season is null) = (episode is null)))
  ) not valid;

alter table public.progress drop constraint if exists progress_title_len;
alter table public.progress add constraint progress_title_len
  check (char_length(title) <= 300) not valid;

alter table public.progress drop constraint if exists progress_poster_len;
alter table public.progress add constraint progress_poster_len
  check (poster is null or char_length(poster) <= 500) not valid;

alter table public.progress drop constraint if exists progress_ids_valid;
alter table public.progress add constraint progress_ids_valid
  check (
    tmdb_id > 0
    and (season is null or season >= 0)
    and (episode is null or episode >= 0)
  ) not valid;

alter table public.progress drop constraint if exists progress_track_shape;
alter table public.progress add constraint progress_track_shape
  check (
    (media_type = 'movie' and season is null and episode is null)
    or (media_type = 'tv' and ((season is null) = (episode is null)))
  ) not valid;

alter table public.search_history drop constraint if exists search_query_len;
alter table public.search_history add constraint search_query_len
  check (char_length(query) between 1 and 200) not valid;

-- 3. PER-USER ROW CAPS
create or replace function public.enforce_watched_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.watched where user_id = new.user_id) >= 10000 then
    raise exception 'watched row limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_watch_later_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.watch_later where user_id = new.user_id) >= 5000 then
    raise exception 'watch_later row limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_progress_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.progress where user_id = new.user_id) >= 5000 then
    raise exception 'progress row limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_search_history_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Re-searching an existing query is an upsert of the same row; it must keep
  -- working when the user is already at the cap.
  if exists (
    select 1 from public.search_history
    where user_id = new.user_id and query = new.query
  ) then
    return new;
  end if;

  if (select count(*) from public.search_history where user_id = new.user_id) >= 100 then
    raise exception 'search_history row limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists watched_row_limit on public.watched;
create trigger watched_row_limit
  before insert on public.watched
  for each row execute function public.enforce_watched_row_limit();

drop trigger if exists watch_later_row_limit on public.watch_later;
create trigger watch_later_row_limit
  before insert on public.watch_later
  for each row execute function public.enforce_watch_later_row_limit();

drop trigger if exists progress_row_limit on public.progress;
create trigger progress_row_limit
  before insert on public.progress
  for each row execute function public.enforce_progress_row_limit();

drop trigger if exists search_history_row_limit on public.search_history;
create trigger search_history_row_limit
  before insert on public.search_history
  for each row execute function public.enforce_search_history_row_limit();

-- 4. REVOKE ANON TABLE ACCESS
-- RLS already blocks anonymous rows, but removing the grants is defence in
-- depth if a policy is ever dropped or misconfigured.
revoke all on table public.watched, public.watch_later, public.search_history, public.progress
  from anon;
