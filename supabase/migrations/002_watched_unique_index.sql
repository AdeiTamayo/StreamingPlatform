-- StreamFlow Supabase Schema
-- Migration 002: Unique index for watched tracks

-- Prevents duplicate watched rows when the same track is watched again.
create unique index if not exists watched_unique_track_idx
  on public.watched (user_id, media_type, tmdb_id, coalesce(season, -1), coalesce(episode, -1));
