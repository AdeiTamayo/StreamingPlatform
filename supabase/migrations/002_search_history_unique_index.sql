-- Searches used to insert one row per search with no uniqueness, so repeat
-- searches stacked duplicates (inflating prune counts and history chips).
-- Drop older duplicates first - the unique index cannot be created otherwise -
-- keeping the newest row per (user_id, query).
delete from public.search_history sh
using public.search_history keep
where sh.user_id = keep.user_id
  and sh.query = keep.query
  and (sh.created_at < keep.created_at
    or (sh.created_at = keep.created_at and sh.id < keep.id));

create unique index if not exists idx_search_history_user_query
  on public.search_history using btree (user_id, query);
