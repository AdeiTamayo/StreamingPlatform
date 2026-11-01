import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getOmdbRatingByTitle,
  peekOmdbRatingByTmdb,
  type ImdbRating,
} from "../api/omdb";
import { getMovieDetail, getTVDetail } from "../api/tmdb";
import { formatRatingTitle, formatVotes } from "../utils/format";
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
  const { t } = useTranslation();
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

  const tooltip = formatRatingTitle(t, {
    imdbRating: imdbRating?.rating,
    imdbVotes: imdbVotes || tmdbVotes || null,
    tomatoes: imdbRating?.tomatoes,
    tmdbRating: display,
  });

  return (
    <span className={className} title={tooltip}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
      </svg>
      <span className="rating-source">{display}</span>
      {imdbRating?.tomatoes && (
        <span className="rating-rt">
          <span aria-hidden="true">/</span>
          <span className="rating-rt-text">{imdbRating.tomatoes}</span>
        </span>
      )}
    </span>
  );
}
