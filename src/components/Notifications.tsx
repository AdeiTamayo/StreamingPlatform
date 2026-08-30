import { useState, useEffect, useRef, useId, memo, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getNotifications, removeNotification, markAllNotificationsRead, clearAllNotifications, pruneOldNotifications } from '../api/storage';
import { scanForNewEpisodes } from '../api/newEpisodeScan';
import { useAuth } from '../hooks/useAuth';
import type { NotificationItem } from '../types';
import styles from './Notifications.module.css';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function formatAirDate(airDate: string | null): string {
  if (!airDate) return '';
  const date = new Date(airDate);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'Today';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function isRecentEpisode(airDate: string | null): boolean {
  if (!airDate) return false;
  return Date.now() - new Date(airDate).getTime() < 7 * 24 * 60 * 60 * 1000;
}

type NotificationPanelProps = {
  panelRef: RefObject<HTMLDivElement | null>;
  panelId: string;
  panelTitleId: string;
  notifications: NotificationItem[];
  unreadCount: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onScan: () => void;
  sidebar?: boolean;
};

function NotificationPanel({
  panelRef,
  panelId,
  panelTitleId,
  notifications,
  unreadCount,
  onClose,
  onRemove,
  onMarkAllRead,
  onClearAll,
  onScan,
  sidebar,
}: NotificationPanelProps) {
  return (
    <>
      <div
        className={`${styles.overlay}${sidebar ? ` ${styles.sidebarOverlay}` : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        id={panelId}
        className={`${styles.panel}${sidebar ? ` ${styles.sidebarPanel}` : ''}`}
        role="dialog"
        aria-labelledby={panelTitleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h3 id={panelTitleId} className={styles.headerTitle}>Notifications</h3>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} className={styles.headerAction}>Mark all read</button>
            )}
            <button onClick={onClose} className={styles.closeBtn} aria-label="Close notifications">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="M6 6 18 18" />
              </svg>
            </button>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <div className={styles.emptyTitle}>No new episodes</div>
            <button className={styles.emptyAction} onClick={onScan}>
              Scan now
            </button>
          </div>
        ) : (
          <ul className={styles.list}>
            {notifications.map((n) => (
              <li key={n.id} className={`${styles.item} ${!n.read ? styles.unread : ''}`}>
                <div className={styles.itemContent}>
                  <div className={styles.itemTitle}>
                    {n.showTitle}
                    {isRecentEpisode(n.airDate) && <span className={styles.newBadge}>NEW</span>}
                  </div>
                  <div className={styles.itemSub}>
                    S{n.season} E{n.episode}
                    {n.episodeTitle && <span> &middot; {n.episodeTitle}</span>}
                  </div>
                  <div className={styles.itemMeta}>
                    {n.airDate && <span>Aired {formatAirDate(n.airDate)}</span>}
                    <span>{formatRelativeTime(n.createdAt)}</span>
                  </div>
                </div>
                <div className={styles.itemActionsButtons}>
                  <Link
                    to={`/tv/${n.showId}?season=${n.season}&episode=${n.episode}`}
                    className={styles.openBtn}
                    onClick={onClose}
                  >
                    Open
                  </Link>
                  <button
                    className={styles.removeBtn}
                    onClick={() => onRemove(n.id)}
                    aria-label={`Remove notification for ${n.showTitle}`}
                    title="Remove"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="M6 6 18 18" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {notifications.length > 0 && (
          <div className={styles.footer}>
            <span className={styles.footerHint}>{notifications.length} total</span>
            <button onClick={onClearAll} className={styles.clearBtn}>Clear all</button>
          </div>
        )}
      </div>
    </>
  );
}

const Notifications = memo(function Notifications({ sidebar }: { sidebar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const panelTitleId = useId();
  const panelId = useId();

  function load() {
    pruneOldNotifications();
    const list: NotificationItem[] = getNotifications();
    setNotifications(list);
    setUnreadCount(list.filter((n) => !n.read).length);
  }

  // Periodic background refresh is throttled to avoid hammering the TMDB API;
  // one-off actions (startup, opening the panel, sync) force an immediate scan.
  async function refresh() {
    await scanForNewEpisodes();
    load();
  }

  async function forceScan() {
    await scanForNewEpisodes(true);
    load();
  }

  const { syncVersion } = useAuth();

  // Background new-episode detection: scan at startup and keep
  // refreshing so the bell reflects new releases within the last
  // week without visiting the series page.
  useEffect(() => {
    load();
    void forceScan();
    const interval = setInterval(() => {
      load();
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (syncVersion > 0) void forceScan();
  }, [syncVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)) {
        closePanel();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel();
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus into the panel on open; restore it to the bell on close.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const t = setTimeout(() => panelRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      btnRef.current?.focus();
    }
  }, [open]);

  function handleRemove(id: string) {
    removeNotification(id);
    load();
  }

  function handleMarkAllRead() {
    markAllNotificationsRead();
    load();
  }

  function handleClearAll() {
    clearAllNotifications();
    load();
  }

  function handleToggle() {
    if (!open) {
      // Fresh check on open so newly released episodes show immediately.
      void scanForNewEpisodes(true).then(load);
    }
    setOpen((previous) => !previous);
  }

  // Unread items are marked as read when the panel closes, so the unread
  // highlight survives long enough to actually be seen.
  function closePanel() {
    if (!open) return;
    handleMarkAllRead();
    setOpen(false);
  }

  return (
    <div className={`${styles.container}${sidebar ? ` ${styles.sidebar}` : ''}`}>
      <button
        ref={btnRef}
        className={styles.bellBtn}
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className={styles.bellIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {sidebar && <span className={styles.bellLabel}>Notifications</span>}
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (sidebar ? (
        createPortal(
          <NotificationPanel
            panelRef={panelRef}
            panelId={panelId}
            panelTitleId={panelTitleId}
            notifications={notifications}
            unreadCount={unreadCount}
            onClose={closePanel}
            onRemove={handleRemove}
            onMarkAllRead={handleMarkAllRead}
            onClearAll={handleClearAll}
            onScan={forceScan}
            sidebar
          />,
          document.body,
        )
      ) : (
        <NotificationPanel
          panelRef={panelRef}
          panelId={panelId}
          panelTitleId={panelTitleId}
          notifications={notifications}
          unreadCount={unreadCount}
          onClose={closePanel}
          onRemove={handleRemove}
          onMarkAllRead={handleMarkAllRead}
          onClearAll={handleClearAll}
          onScan={forceScan}
        />
      ))}
    </div>
  );
});

export default Notifications;