import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, removeNotification, markAllNotificationsRead, clearAllNotifications } from '../api/storage';
import styles from './Notifications.module.css';

function formatRelativeTime(timestamp) {
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

export default function Notifications({ sidebar }: { sidebar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  function load() {
    const list = getNotifications();
    setNotifications(list);
    setUnreadCount(list.filter((n) => !n.read).length);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleRemove(id) {
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
    const next = !open;
    setOpen(next);
    if (next) {
      handleMarkAllRead();
    }
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
        aria-controls="notifications-panel"
      >
        <span className={styles.bellIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <>
          <div className={styles.overlay} onClick={() => setOpen(false)} />
          <div ref={panelRef} id="notifications-panel" className={styles.panel} role="dialog" aria-label="Notifications panel">
            <div className={styles.header}>
              <div className={styles.headerCopy}>
                <h3 className={styles.headerTitle}>Notifications</h3>
                <p className={styles.headerSubtitle}>
                  {notifications.length === 0
                    ? 'You will see episode alerts here.'
                    : unreadCount > 0
                      ? `${unreadCount} unread ${unreadCount === 1 ? 'alert' : 'alerts'}`
                      : ''}
                </p>
              </div>
              <div className={styles.headerActions}>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className={styles.headerAction}>Mark all read</button>
                )}
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div className={styles.emptyTitle}>No notifications yet</div>
                <div className={styles.emptyText}>Episode alerts will appear here when new releases are detected.</div>
              </div>
            ) : (
              <ul className={styles.list}>
                {notifications.map((n) => (
                  <li key={n.id} className={`${styles.item} ${!n.read ? styles.unread : ''}`}>
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>{n.showTitle}</div>
                      <div className={styles.itemSub}>
                        S{n.season} E{n.episode}
                        {n.episodeTitle && <span> &middot; {n.episodeTitle}</span>}
                      </div>
                      <div className={styles.itemMeta}>
                        {n.airDate && <span>Airs {n.airDate}</span>}
                        <span>{formatRelativeTime(n.createdAt)}</span>
                      </div>
                    </div>
                    <div className={styles.itemActionsButtons}>
                      <Link
                        to={`/tv/${n.showId}?season=${n.season}&episode=${n.episode}`}
                        className={styles.openBtn}
                        onClick={() => setOpen(false)}
                      >
                        Open
                      </Link>
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleRemove(n.id)}
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
                <button onClick={handleClearAll} className={styles.clearBtn}>Clear all</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}