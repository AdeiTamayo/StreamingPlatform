import type { TFunction } from "i18next";
import i18n, { toBcp47 } from "../i18n";

/** Formats a runtime in minutes using the active language ("2h 49m" / "49m"). */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return i18n.t("format.runtimeMinutes", { minutes: mins });
  if (mins > 0) return i18n.t("format.runtimeHoursMinutes", { hours, minutes: mins });
  return i18n.t("format.runtimeHours", { hours });
}

/** Compacts a vote count ("2,345,678") using the active language's suffixes. */
export function formatVotes(votes: string | null | undefined): string {
  if (!votes) return "";
  const n = Number(String(votes).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  const decimalSeparator = i18n.t("format.decimalSeparator");
  const localizeDecimal = (value: string) =>
    decimalSeparator === "." ? value : value.replace(".", decimalSeparator);
  if (n >= 1_000_000) {
    const value = localizeDecimal((n / 1_000_000).toFixed(1).replace(/\.0$/, ""));
    return i18n.t("format.votesM", { value });
  }
  if (n >= 1_000) return i18n.t("format.votesK", { value: Math.round(n / 1_000) });
  return n.toLocaleString(toBcp47(i18n.resolvedLanguage || i18n.language));
}

interface RatingTitleInput {
  /** IMDb score out of 10; takes priority over the TMDB score. */
  imdbRating?: string | null;
  imdbVotes?: string | null;
  tomatoes?: string | null;
  tmdbRating?: string | null;
}

/**
 * Builds the badge tooltip ("IMDb 8.4/10 · 1,234 votes · Rotten Tomatoes 92%")
 * from whichever rating data is available. Falls back to the TMDB score.
 */
export function formatRatingTitle(t: TFunction, { imdbRating, imdbVotes, tomatoes, tmdbRating }: RatingTitleInput): string {
  const parts: string[] = [];
  if (imdbRating) parts.push(t("rating.imdb", { rating: imdbRating }));
  else if (tmdbRating) parts.push(t("rating.tmdb", { rating: tmdbRating }));
  if (imdbVotes) {
    const count = Number(String(imdbVotes).replace(/[^0-9.]/g, ""));
    parts.push(t("rating.votes", { count, value: imdbVotes }));
  }
  if (tomatoes) parts.push(t("rating.rottenTomatoes", { value: tomatoes }));
  return parts.join(" \u00b7 ");
}
