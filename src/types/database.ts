export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      watched: {
        Row: WatchedRow;
        Insert: WatchedInsert;
        Update: WatchedUpdate;
        Relationships: [];
      };
      watch_later: {
        Row: WatchLaterRow;
        Insert: WatchLaterInsert;
        Update: WatchLaterUpdate;
        Relationships: [];
      };
      search_history: {
        Row: SearchHistoryRow;
        Insert: SearchHistoryInsert;
        Update: SearchHistoryUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type WatchedRow = {
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

export type WatchedInsert = {
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

export type WatchedUpdate = {
  media_type?: 'movie' | 'tv';
  tmdb_id?: number;
  title?: string;
  season?: number | null;
  episode?: number | null;
  watched_at?: string;
  meta?: Json | null;
}

export type WatchLaterRow = {
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

export type WatchLaterInsert = {
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

export type WatchLaterUpdate = {
  media_type?: 'movie' | 'tv';
  tmdb_id?: number;
  title?: string;
  year?: string | null;
  poster?: string | null;
  season?: number | null;
  episode?: number | null;
}

export type SearchHistoryRow = {
  id: string;
  user_id: string;
  query: string;
  created_at: string;
}

export type SearchHistoryInsert = {
  id?: string;
  user_id: string;
  query: string;
  created_at?: string;
}

export type SearchHistoryUpdate = {
  query?: string;
}
