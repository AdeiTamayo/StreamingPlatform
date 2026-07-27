import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, removeNotification, markAllNotificationsRead, clearAllNotifications } from '../api/storage';
import styles from './Notifications.module.css';

export default function Notifications() {
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
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
    <div className={styles.container}>
      <button ref={btnRef} className={styles.bellBtn} onClick={handleToggle} aria-label="Notifications">
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
          <div ref={panelRef} className={styles.panel}>
            <div className={styles.header}>
              <h3 className={styles.headerTitle}>Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className={styles.headerAction}>Mark all read</button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No notifications yet</div>
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
                      {n.airDate && <div className={styles.itemDate}>Aired {n.airDate}</div>}
                    </div>
                    <div className={styles.itemActions}>
                      <Link
                        to={`/tv/${n.showId}?season=${n.season}&episode=${n.episode}`}
                        className={styles.openBtn}
                        onClick={() => setOpen(false)}
                      >
                        Open
                      </Link>
                      <button className={styles.removeBtn} onClick={() => handleRemove(n.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {notifications.length > 0 && (
              <div className={styles.footer}>
                <button onClick={handleClearAll} className={styles.clearBtn}>Clear all</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
