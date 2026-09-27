export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      watched: {
        Row: WatchedRow;
        Insert: WatchedInsert;
        Update: WatchedUpdate;
      };
      watch_later: {
        Row: WatchLaterRow;
        Insert: WatchLaterInsert;
        Update: WatchLaterUpdate;
      };
      search_history: {
        Row: SearchHistoryRow;
        Insert: SearchHistoryInsert;
        Update: SearchHistoryUpdate;
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
