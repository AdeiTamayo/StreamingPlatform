import { useState, useEffect, useRef, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useClickOutside from '../hooks/useClickOutside';
import Notifications from './Notifications';
import styles from './Navbar.module.css';

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Home',
    icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  },
  {
    to: '/movies',
    label: 'Movies',
    icon: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" /></>,
  },
  {
    to: '/tv',
    label: 'TV Shows',
    icon: <><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></>,
  },
  {
    to: '/watch-later',
    label: 'Watch Later',
    icon: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></>,
  },
  {
    to: '/last-seen',
    label: 'Last Seen',
    icon: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  },
];

const Navbar = memo(function Navbar() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const sidebarRef = useClickOutside(() => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchBtnRef = useRef<HTMLButtonElement | null>(null);
  const goBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastScrollRef = useRef(0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setMenuOpen(false);
    }
  }

  function isActive(path: string) {
    if (path === '/') {
      return location.pathname === '/';
    }

    return location.pathname.startsWith(path);
  }

  function toggleSearch() {
    setSearchOpen((previous) => {
      if (!previous) {
        setTimeout(() => searchRef.current?.focus(), 100);
      }

      return !previous;
    });
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const tag = document.activeElement?.tagName;

        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT'
        ) {
          return;
        }

        e.preventDefault();

        setSearchOpen(true);

        setTimeout(() => {
          searchRef.current?.focus();
        }, 100);
      }
    }

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle(
      'sidebar-open',
      menuOpen
    );

    return () => {
      document.body.classList.remove('sidebar-open');
    };
  }, [menuOpen]);

  useEffect(() => {
    function handleScroll() {
      const currentScroll = window.scrollY;

      setScrolled(currentScroll > 10);

      if (currentScroll > 100) {
        setHidden(
          currentScroll > lastScrollRef.current
        );
      } else {
        setHidden(false);
      }

      lastScrollRef.current = currentScroll;
    }

    window.addEventListener(
      'scroll',
      handleScroll,
      { passive: true }
    );

    return () => {
      window.removeEventListener(
        'scroll',
        handleScroll
      );
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    searchRef.current?.focus();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;

      const outsideInput =
        searchRef.current &&
        !searchRef.current.contains(target);

      const outsideToggle =
        searchBtnRef.current &&
        !searchBtnRef.current.contains(target);

      const outsideGo =
        goBtnRef.current &&
        !goBtnRef.current.contains(target);

      if (
        outsideInput &&
        outsideToggle &&
        outsideGo
      ) {
        setSearchOpen(false);
        setQuery('');
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, [searchOpen]);

  function renderNavIcon(item: typeof NAV_ITEMS[number]) {
    return (
      <Link
        key={item.to}
        to={item.to}
        className={[
          styles.navIconBtn,
          isActive(item.to) ? styles.active : '',
        ].join(' ')}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {item.icon}
        </svg>
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <>
      <nav
        className={[
          styles.navbar,
          scrolled ? styles.scrolled : '',
          hidden ? styles.hidden : '',
        ].join(' ')}
      >
        <div className={styles.navbarInner}>
          <div className={styles.navLinks}>
            {NAV_ITEMS.map(renderNavIcon)}
          </div>

          <form
            className={styles.navbarSearch}
            onSubmit={handleSubmit}
          >
            <input
              ref={searchRef}
              type="text"
              placeholder="Search... (/)"
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              className={
                searchOpen
                  ? styles.open
                  : ''
              }
            />

            {!searchOpen && (
              <button
                ref={searchBtnRef}
                type="button"
                className={styles.searchToggleBtn}
                onClick={toggleSearch}
                aria-label="Search"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line
                    x1="21"
                    y1="21"
                    x2="16.65"
                    y2="16.65"
                  />
                </svg>
              </button>
            )}

            {searchOpen && (
              <button
                ref={goBtnRef}
                type="submit"
                className={styles.searchGoBtn}
              >
                Go
              </button>
            )}
          </form>
          <Link
            to="/settings"
            className={[
              styles.iconBtn,
              isActive('/settings')
                ? styles.active
                : '',
            ].join(' ')}
            aria-label="Settings"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>

          <Notifications />
        </div>
      </nav>

      <button
        className={styles.sidebarHamburger}
        onClick={() =>
          setMenuOpen((previous) => !previous)
        }
        aria-label="Toggle menu"
      >
        <span className={`${styles.hamburgerLine}${menuOpen ? ` ${styles.open}` : ''}`} />
        <span className={`${styles.hamburgerLine}${menuOpen ? ` ${styles.open}` : ''}`} />
        <span className={`${styles.hamburgerLine}${menuOpen ? ` ${styles.open}` : ''}`} />
      </button>

      {menuOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={[
          styles.sidebar,
          menuOpen
            ? styles.sidebarOpen
            : '',
        ].join(' ')}
        ref={sidebarRef}
      >
        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item, index) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                styles.sidebarLink,
                isActive(item.to)
                  ? styles.active
                  : '',
              ].join(' ')}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              <span className={styles.sidebarIconWrap}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {item.icon}
                </svg>
              </span>
              <span>{item.label}</span>
            </Link>
          ))}

          <Link
            to="/settings"
            className={[
              styles.sidebarLink,
              isActive('/settings')
                ? styles.active
                : '',
            ].join(' ')}
          >
            <span className={styles.sidebarIconWrap}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <span>Settings</span>
          </Link>
        </nav>

        <div className={styles.sidebarNotif}>
          <div className={styles.sidebarNotifRow}>
            <Notifications sidebar />
            <span className={styles.sidebarNotifText}>Notifications</span>
          </div>
        </div>

        <form
          className={styles.sidebarSearch}
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
          />

          <button type="submit">
            Search
          </button>
        </form>
      </aside>
    </>
  );
});

export default Navbar;