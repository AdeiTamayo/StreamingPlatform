import { useEffect, useState } from "react";
import {
  getOmdbRatingByTitle,
  peekOmdbRatingByTmdb,
  type ImdbRating,
} from "../api/omdb";
import { getMovieDetail, getTVDetail } from "../api/tmdb";
import { formatVotes } from "../utils/format";
import type { MediaType } from "../types";

/**
 * Single implementation of the IMDb-or-TMDB rating badge used by MediaCard
 * (Home / Movies / TV) and Watch Later. Rendered as a bare span so callers
 * keep control of positioning and class names.
 *
 * The synchronous peek means a cached rating (or a recorded miss) renders on
 * the first paint with no network round trip; only a genuine cache miss fires
 * a request.
 */
export default function RatingBadge({
  id,
  title,
  year,
  type,
  className,
  /** Optional TMDB vote average, used until (or instead of) an IMDb rating. */
  fallbackRating,
  /** Optional TMDB vote count, used when the rating provider has none. */
  fallbackVotes,
}: {
  id: string | number;
  title: string;
  year: string;
  type: MediaType;
  className?: string;
  fallbackRating?: string | null;
  fallbackVotes?: string | number | null;
}) {
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(() => {
    const peek = peekOmdbRatingByTmdb(id);
    return peek.state === "cached" ? peek.rating : null;
  });
  const [fetchedTmdb, setFetchedTmdb] = useState<string | null>(null);
  const [fetchedTmdbVotes, setFetchedTmdbVotes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFetchedTmdbVotes(null);

    const peek = peekOmdbRatingByTmdb(id);
    if (peek.state !== "fresh") {
      setImdbRating(peek.rating);
    } else {
      getOmdbRatingByTitle(
        id,
        title,
        year || "",
        type === "tv" ? "series" : "movie",
      ).then((r) => {
        if (!cancelled) setImdbRating(r);
      });
    }

    // Only needed when the caller did not already know the vote average.
    if (fallbackRating == null) {
      (type === "movie" ? getMovieDetail(id) : getTVDetail(id))
        .then((detail) => {
          if (cancelled) return;
          const v = (detail as { vote_average?: number })?.vote_average;
          setFetchedTmdb(v ? v.toFixed(1) : "?");
          const voteCount = (detail as { vote_count?: number })?.vote_count;
          setFetchedTmdbVotes(typeof voteCount === "number" && voteCount > 0 ? voteCount : null);
        })
        .catch(() => {
          if (!cancelled) setFetchedTmdb("?");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [type, id, title, year, fallbackRating]);

  const display = imdbRating ? imdbRating.rating : fetchedTmdb ?? fallbackRating;
  if (!display) return null;

  // Providers such as Cinemeta return a rating without a vote count, so fall
  // back to TMDB's count instead of leaving the tooltip without any votes.
  const imdbVotes = imdbRating?.votes ? formatVotes(imdbRating.votes) : "";
  const tmdbVoteSource = fallbackVotes ?? fetchedTmdbVotes;
  const tmdbVotes = tmdbVoteSource != null ? formatVotes(String(tmdbVoteSource)) : "";

  return (
    <span
      className={className}
      title={
        imdbRating
          ? `IMDb ${imdbRating.rating}/10${imdbVotes ? ` \u00b7 ${imdbVotes} votes` : tmdbVotes ? ` \u00b7 ${tmdbVotes} TMDB votes` : ""}${imdbRating.tomatoes ? ` \u00b7 Rotten Tomatoes ${imdbRating.tomatoes}` : ""}`
          : `TMDB rating ${display}/10${tmdbVotes ? ` \u00b7 ${tmdbVotes} votes` : ""}`
      }
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
      </svg>
      <span className="rating-source">{display}{imdbRating?.tomatoes ? " /" : ""}</span>
      {imdbRating?.tomatoes && (
        <span className="rating-rt-text">{imdbRating.tomatoes}</span>
      )}
    </span>
  );
}