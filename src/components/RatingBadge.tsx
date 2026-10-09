import { useEffect, useState } from "react";
import {
  getOmdbRatingByTitle,
  peekOmdbRatingByTmdb,
  type ImdbRating,
} from "../api/omdb";
import { getMovieDetail, getTVDetail } from "../api/tmdb";
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
}: {
  id: string | number;
  title: string;
  year: string;
  type: MediaType;
  className?: string;
  fallbackRating?: string | null;
}) {
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(() => {
    const peek = peekOmdbRatingByTmdb(id);
    return peek.state === "cached" ? peek.rating : null;
  });
  const [fetchedTmdb, setFetchedTmdb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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

  return (
    <span
      className={className}
      title={
        imdbRating
          ? `IMDb ${imdbRating.rating}/10${imdbRating.votes ? ` \u00b7 ${imdbRating.votes} votes` : ""}`
          : `TMDB rating ${display}/10`
      }
    >
      {display}
    </span>
  );
}