export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  media_type?: string;
  runtime?: number;
  credits?: TMDBCredits;
  videos?: TMDBVideos;
  recommendations?: TMDBPaginatedResponse<TMDBMovie>;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  original_language?: string;
  original_title?: string;
  popularity?: number;
  adult?: boolean;
  video?: boolean;
}

export interface TMDBSeries {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  media_type?: string;
  seasons?: TMDBSeason[];
  credits?: TMDBCredits;
  videos?: TMDBVideos;
  recommendations?: TMDBPaginatedResponse<TMDBSeries>;
  episode_run_time?: number[];
  created_by?: TMDBCreator[];
  networks?: TMDBNetwork[];
  status?: string;
  tagline?: string;
  origin_country?: string[];
  original_language?: string;
  original_name?: string;
  popularity?: number;
  in_production?: boolean;
  last_air_date?: string;
  next_episode_to_air?: TMDBEpisodeToAir;
  number_of_seasons?: number;
  number_of_episodes?: number;
  type?: string;
  homepage?: string;
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  name: string;
  overview?: string;
  vote_average?: number;
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  runtime: number | null;
  show_id?: number;
}

export interface TMDBEpisodeToAir {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  air_date: string;
  overview?: string;
  still_path?: string | null;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBCountry {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBVideos {
  results: TMDBVideo[];
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBCredits {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

export interface TMDBCreator {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface TMDBNetwork {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TMDBPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBDiscoverFilters {
  genreId?: string;
  country?: string;
  year?: string;
  sortBy?: string;
  releaseDateGte?: string;
  releaseDateLte?: string;
}

export type MediaType = 'movie' | 'tv';

export type VideoSourceKey = 'vidsrc' | '2embed' | 'vsembed_ru' | 'vsembed_su' | 'embos';

export interface WatchLaterItem {
  type: MediaType;
  id: number | string;
  title: string;
  year: string;
  poster: string;
  addedAt: number;
}

export interface EpisodeWatchLaterItem {
  showId: number | string;
  season: number;
  episode: number;
  showTitle: string;
  addedAt: number;
}

export interface ProgressData {
  type: MediaType;
  id: number | string;
  currentTime: number;
  savedAt: number;
  season?: number;
  episode?: number;
  meta?: Record<string, unknown>;
}

export interface WatchedData {
  type: MediaType;
  id: number | string;
  title: string;
  watchedAt: number;
  season?: number;
  episode?: number;
  meta?: Record<string, unknown>;
}

export interface LastSeenItem {
  storageKey: string;
  type: MediaType;
  id: number | string;
  title: string | null;
  season: number | null;
  episode: number | null;
  ts: number;
  source: 'watched' | 'progress';
  currentTime?: number;
  meta?: Record<string, unknown> | null;
}

export interface ContinueWatchingItem {
  type: MediaType;
  id: number | string;
  season: number | null;
  episode: number | null;
  currentTime: number;
  savedAt: number;
  meta?: Record<string, unknown> | null;
}

export interface CalendarItem {
  date: string;
  title: string;
  type: 'movie' | 'episode';
  id: string | number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  poster?: string;
}

export interface NotificationItem {
  id: string;
  showId: string;
  showTitle: string;
  season: number;
  episode: number;
  episodeTitle: string | null;
  type: string;
  airDate: string | null;
  createdAt: number;
  read: boolean;
}

export interface StorageUsage {
  total: number;
  breakdown: {
    watched: number;
    progress: number;
    watchlater: number;
    epwl: number;
    notifications: number;
    cache: number;
    other: number;
  };
}

export interface Stats {
  moviesWatched: number;
  episodesWatched: number;
  watchLaterCount: number;
}

export interface FilterOption {
  value: string;
  label: string;
}
