import { useTranslation } from "react-i18next";
import { useToast } from "./useToast";

interface DetailActionsProps {
  inList: boolean;
  watched: boolean;
  onToggleList: () => void;
  onToggleWatched: () => void;
  shareTitle: string;
  onToggleTrailer?: () => void;
  trailerActive?: boolean;
  isAuthenticated?: boolean;
}

export default function DetailActions({
  inList,
  watched,
  onToggleList,
  onToggleWatched,
  shareTitle,
  onToggleTrailer,
  trailerActive = false,
  isAuthenticated = true,
}: DetailActionsProps) {
  const toast = useToast();
  const { t } = useTranslation();

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({ title: shareTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast?.(t("detailActions.linkCopied"));
    } catch {
      // The user dismissed the share sheet or the clipboard was blocked.
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="detail-actions">
        <button
          type="button"
          className="detail-action-icon"
          onClick={handleShare}
          title={t("detailActions.share")}
          aria-label={t("detailActions.share")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
            <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="detail-actions">
      <button
        type="button"
        className={`detail-action-pill${inList ? " active-saved" : ""}`}
        onClick={onToggleList}
        aria-pressed={inList}
        title={
          inList
            ? t("media.removeWatchLater")
            : t("detailActions.saveWatchLater")
        }
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </svg>
        {inList
          ? t("detailActions.savedInList")
          : t("detailActions.saveToList")}
      </button>
      <button
        type="button"
        className={`detail-action-pill${watched ? " active-watched" : ""}`}
        onClick={onToggleWatched}
        aria-pressed={watched}
        title={
          watched
            ? t("detailActions.unmarkAsWatched")
            : t("detailActions.markAsWatched")
        }
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 7 17l-5-5" />
          <path d="m22 10-7.5 7.5L13 16" />
        </svg>
        {watched
          ? t("detailActions.watched")
          : t("detailActions.markAsWatchedLabel")}
      </button>
      {onToggleTrailer && (
        <button
          type="button"
          className={`detail-action-pill${trailerActive ? " active-trailer" : ""}`}
          onClick={onToggleTrailer}
          aria-pressed={trailerActive}
          title={
            trailerActive
              ? t("detailActions.hideTrailer")
              : t("detailActions.playTrailer")
          }
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
            <path d="m6.2 5.3 3.1 3.9" />
            <path d="m12.4 3.4 3.1 4" />
            <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
          {t("detailActions.trailer")}
        </button>
      )}
      <button
        type="button"
        className="detail-action-icon"
        onClick={handleShare}
        title={t("detailActions.share")}
        aria-label={t("detailActions.share")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
          <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
        </svg>
      </button>
    </div>
  );
}
