import { useState, useEffect, useLayoutEffect, useRef, useId, memo, type RefObject, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getNotifications, removeNotification, markAllNotificationsRead, clearAllNotifications, pruneOldNotifications, NOTIFICATIONS_KEY } from '../api/storage';
import { scanForNewEpisodes } from '../api/newEpisodeScan';
import { useAuth } from '../hooks/useAuth';
import type { NotificationItem } from '../types';
import styles from './Notifications.module.css';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
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

function isFutureDate(airDate: string | null): boolean {
  if (!airDate) return false;
  return new Date(airDate).getTime() > Date.now();
}

function formatAirDate(airDate: string | null): string {
  if (!airDate) return '';
  const date = new Date(airDate);
  const time = date.getTime();
  if (time > Date.now()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }
  const diffDays = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'Today';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function isRecentEpisode(airDate: string | null): boolean {
  if (!airDate) return false;
  const time = new Date(airDate).getTime();
  if (time > Date.now()) return false;
  return Date.now() - time < 7 * 24 * 60 * 60 * 1000;
}

function markNotificationRead(id: string): void {
  const list = getNotifications();
  let changed = false;
  list.forEach((n) => {
    if (n.id === id && !n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
}

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) =>
      el.getAttribute('aria-hidden') !== 'true' &&
      (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
  );
}

type NotificationPanelProps = {
  panelRef: RefObject<HTMLDivElement | null>;
  panelId: string;
  panelTitleId: string;
  notifications: NotificationItem[];
  unreadCount: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
  onUndoClear: () => void;
  clearConfirm: boolean;
  undoCount: number;
  onScan: () => void;
  sidebar?: boolean;
  panelStyle?: CSSProperties;
};

function NotificationPanel({
  panelRef,
  panelId,
  panelTitleId,
  notifications,
  unreadCount,
  onClose,
  onRemove,
  onMarkRead,
  onMarkAllRead,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
  onUndoClear,
  clearConfirm,
  undoCount,
  onScan,
  sidebar,
  panelStyle,
}: NotificationPanelProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(panelRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

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
        aria-modal="true"
        aria-labelledby={panelTitleId}
        tabIndex={-1}
        style={panelStyle}
        onKeyDown={handleKeyDown}
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
                    {n.airDate && <span>{isFutureDate(n.airDate) ? 'Airs' : 'Aired'} {formatAirDate(n.airDate)}</span>}
                    <span>{formatRelativeTime(n.createdAt)}</span>
                  </div>
                </div>
                <div className={styles.itemActionsButtons}>
                  {!n.read && (
                    <button
                      type="button"
                      className={styles.markReadBtn}
                      onClick={() => onMarkRead(n.id)}
                      aria-label={`Mark notification for ${n.showTitle} as read`}
                      title="Mark as read"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}
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
        {(notifications.length > 0 || undoCount > 0) && (
          <div className={styles.footer}>
            {undoCount > 0 ? (
              <>
                <span className={styles.footerHint}>Cleared {undoCount}</span>
                <button onClick={onUndoClear} className={styles.clearBtn}>Undo</button>
              </>
            ) : clearConfirm ? (
              <>
                <span className={styles.footerHint}>Clear all notifications?</span>
                <div className={styles.footerConfirm}>
                  <button onClick={onConfirmClear} className={styles.clearBtn}>Clear</button>
                  <button onClick={onCancelClear} className={styles.headerAction}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span className={styles.footerHint}>{notifications.length} total</span>
                <button onClick={onRequestClear} className={styles.clearBtn}>Clear all</button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// The bell mounts twice (navbar + sidebar). Share one forced scan across
// instances so startup/sync doesn't hit TMDB twice for the same shows.
let inflightSharedScan: Promise<number> | null = null;

function sharedForceScan(): Promise<number> {
  if (!inflightSharedScan) {
    inflightSharedScan = scanForNewEpisodes(true).finally(() => {
      inflightSharedScan = null;
    });
  }
  return inflightSharedScan;
}

// One 30s background loop for every mounted bell instead of one per instance.
const scanListeners = new Set<() => void>();
let scanIntervalId: ReturnType<typeof setInterval> | null = null;

function subscribeScanRefresh(listener: () => void): () => void {
  scanListeners.add(listener);
  if (scanIntervalId === null) {
    scanIntervalId = setInterval(() => {
      if (document.hidden) return;
      void scanForNewEpisodes().then(() => {
        scanListeners.forEach((notify) => notify());
      });
    }, 30000);
  }
  return () => {
    scanListeners.delete(listener);
    if (scanListeners.size === 0 && scanIntervalId !== null) {
      clearInterval(scanIntervalId);
      scanIntervalId = null;
    }
  };
}

const Notifications = memo(function Notifications({ sidebar }: { sidebar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<NotificationItem[] | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelTitleId = useId();
  const panelId = useId();

  function load() {
    pruneOldNotifications();
    const list: NotificationItem[] = getNotifications();
    setNotifications(list);
    setUnreadCount(list.filter((n) => !n.read).length);
  }

  async function forceScan() {
    await sharedForceScan();
    load();
  }

  const { syncVersion } = useAuth();

  useEffect(() => {
    load();
    void forceScan();
    const unsubscribe = subscribeScanRefresh(load);
    return unsubscribe;
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

  // Anchor the portaled panel to the bell on desktop. On mobile the panel is a
  // bottom sheet positioned by CSS.
  useLayoutEffect(() => {
    if (!open || sidebar) return;
    function update() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
        left: 'auto',
      });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, sidebar]);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  function handleRemove(id: string) {
    removeNotification(id);
    load();
  }

  function handleMarkRead(id: string) {
    markNotificationRead(id);
    load();
  }

  function handleMarkAllRead() {
    markAllNotificationsRead();
    load();
  }

  function handleRequestClear() {
    setClearConfirm(true);
  }

  function handleCancelClear() {
    setClearConfirm(false);
  }

  function handleConfirmClear() {
    const snapshot = getNotifications();
    clearAllNotifications();
    setClearConfirm(false);
    load();
    if (snapshot.length === 0) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoSnapshot(snapshot);
    undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 8000);
  }

  function handleUndoClear() {
    if (!undoSnapshot) return;
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(undoSnapshot));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoSnapshot(null);
    load();
  }

  function handleToggle() {
    if (open) {
      // Same close path as outside-click/Escape so unread items still get
      // marked read when the bell itself is used to dismiss the panel.
      closePanel();
      return;
    }
    // Fresh check on open so newly released episodes show immediately.
    void scanForNewEpisodes(true).then(load);
    setOpen(true);
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
      <span className={styles.srOnly} aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} unread notifications` : 'No unread notifications'}
      </span>
      {open && createPortal(
        <NotificationPanel
          panelRef={panelRef}
          panelId={panelId}
          panelTitleId={panelTitleId}
          notifications={notifications}
          unreadCount={unreadCount}
          onClose={closePanel}
          onRemove={handleRemove}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onRequestClear={handleRequestClear}
          onConfirmClear={handleConfirmClear}
          onCancelClear={handleCancelClear}
          onUndoClear={handleUndoClear}
          clearConfirm={clearConfirm}
          undoCount={undoSnapshot?.length ?? 0}
          onScan={forceScan}
          sidebar={sidebar}
          panelStyle={sidebar ? undefined : panelStyle}
        />,
        document.body,
      )}
    </div>
  );
});

export default Notifications;
