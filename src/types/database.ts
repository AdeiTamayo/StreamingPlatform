export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      watched: {
        Row: WatchedRow;
        Insert: WatchedInsert;
        Update: WatchedUpdate;
      };
      progress: {
        Row: ProgressRow;
        Insert: ProgressInsert;
        Update: ProgressUpdate;
      };
      watch_later: {
        Row: WatchLaterRow;
        Insert: WatchLaterInsert;
        Update: WatchLaterUpdate;
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      search_history: {
        Row: SearchHistoryRow;
        Insert: SearchHistoryInsert;
        Update: SearchHistoryUpdate;
      };
      settings: {
        Row: SettingsRow;
        Insert: SettingsInsert;
        Update: SettingsUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface WatchedRow {
  id: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  season: number | null;
  episode: number | null;
  watched_at: string;
  meta: Json | null;
}

export interface WatchedInsert {
  id?: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  season?: number | null;
  episode?: number | null;
  watched_at?: string;
  meta?: Json | null;
}

export interface WatchedUpdate {
  media_type?: 'movie' | 'tv';
  tmdb_id?: number;
  title?: string;
  season?: number | null;
  episode?: number | null;
  watched_at?: string;
  meta?: Json | null;
}

export interface ProgressRow {
  id: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  season: number | null;
  episode: number | null;
  current_time: number;
  duration: number | null;
  meta: Json | null;
  updated_at: string;
}

export interface ProgressInsert {
  id?: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  season?: number | null;
  episode?: number | null;
  current_time: number;
  duration?: number | null;
  meta?: Json | null;
  updated_at?: string;
}

export interface ProgressUpdate {
  media_type?: 'movie' | 'tv';
  tmdb_id?: number;
  season?: number | null;
  episode?: number | null;
  current_time?: number;
  duration?: number | null;
  meta?: Json | null;
  updated_at?: string;
}

export interface WatchLaterRow {
  id: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  year: string | null;
  poster: string | null;
  season: number | null;
  episode: number | null;
  created_at: string;
}

export interface WatchLaterInsert {
  id?: string;
  user_id: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  year?: string | null;
  poster?: string | null;
  season?: number | null;
  episode?: number | null;
  created_at?: string;
}

export interface WatchLaterUpdate {
  media_type?: 'movie' | 'tv';
  tmdb_id?: number;
  title?: string;
  year?: string | null;
  poster?: string | null;
  season?: number | null;
  episode?: number | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  media_type: 'movie' | 'tv' | null;
  tmdb_id: number | null;
  season: number | null;
  episode: number | null;
  read: boolean;
  created_at: string;
}

export interface NotificationInsert {
  id?: string;
  user_id: string;
  title: string;
  message?: string | null;
  media_type?: 'movie' | 'tv' | null;
  tmdb_id?: number | null;
  season?: number | null;
  episode?: number | null;
  read?: boolean;
  created_at?: string;
}

export interface NotificationUpdate {
  title?: string;
  message?: string | null;
  media_type?: 'movie' | 'tv' | null;
  tmdb_id?: number | null;
  season?: number | null;
  episode?: number | null;
  read?: boolean;
}

export interface SearchHistoryRow {
  id: string;
  user_id: string;
  query: string;
  created_at: string;
}

export interface SearchHistoryInsert {
  id?: string;
  user_id: string;
  query: string;
  created_at?: string;
}

export interface SearchHistoryUpdate {
  query?: string;
}

export interface SettingsRow {
  user_id: string;
  preferred_video_source: string;
  updated_at: string;
}

export interface SettingsInsert {
  user_id: string;
  preferred_video_source?: string;
  updated_at?: string;
}

export interface SettingsUpdate {
  preferred_video_source?: string;
  updated_at?: string;
}
