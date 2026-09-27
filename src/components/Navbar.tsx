import { useState, useEffect, useRef, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useClickOutside from '../hooks/useClickOutside';
import { useAuth } from '../hooks/useAuth';
import { getSearchHistory, removeSearchHistory } from '../api/storage';
import Notifications from './Notifications';
import AccountButton from './AccountButton/AccountButton';
import styles from './Navbar.module.css';

const PUBLIC_NAV_ITEMS = [
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
];

const PERSONAL_NAV_ITEMS = [
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

type NavItem = typeof PUBLIC_NAV_ITEMS[number];

const Navbar = memo(function Navbar() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const sidebarRef = useClickOutside(() => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchBtnRef = useRef<HTMLButtonElement | null>(null);
  const goBtnRef = useRef<HTMLButtonElement | null>(null);
  const suggestRef = useRef<HTMLDivElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const firstSidebarLinkRef = useRef<HTMLAnchorElement | null>(null);
  const lastScrollRef = useRef(0);
  const wasMenuOpenRef = useRef(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setMenuOpen(false);
    }
  }

  function selectSuggestion(q: string) {
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setMenuOpen(false);
    setSearchOpen(false);
    setQuery('');
    searchRef.current?.blur();
  }

  function removeSuggestion(q: string) {
    removeSearchHistory(q);
    setSearchHistory(getSearchHistory());
  }

  // Compact recent-search suggestions for the navbar search bar, filtered
  // by what is typed. Fewer rows than the full search page dropdown.
  const navSuggestions = (() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? searchHistory.filter((h) => h.toLowerCase().includes(needle))
      : searchHistory;
    return matches.slice(0, 5);
  })();
  const showNavSuggest =
    searchOpen && searchFocused && navSuggestions.length > 0;

  function isActive(path: string) {
    if (path === '/') {
      return location.pathname === '/';
    }

    if (path === '/movies' && location.pathname.startsWith('/movie/')) {
      return true;
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

  // Focus the first sidebar link on open, restore focus to the hamburger
  // on close (skipped on first render so the button isn't focused on load).
  useEffect(() => {
    if (menuOpen) {
      wasMenuOpenRef.current = true;
      firstSidebarLinkRef.current?.focus();
    } else if (wasMenuOpenRef.current) {
      wasMenuOpenRef.current = false;
      hamburgerRef.current?.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
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

    setSearchHistory(getSearchHistory());
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

      const outsideSuggest =
        !suggestRef.current ||
        !suggestRef.current.contains(target);

      if (
        outsideInput &&
        outsideToggle &&
        outsideGo &&
        outsideSuggest
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

  function renderNavIcon(item: NavItem) {
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
            {PUBLIC_NAV_ITEMS.map(renderNavIcon)}
            {isAuthenticated && PERSONAL_NAV_ITEMS.map(renderNavIcon)}
          </div>

          <form
            className={styles.navbarSearch}
            onSubmit={handleSubmit}
          >
            <span
              className={
                searchOpen
                  ? `${styles.searchField} ${styles.open}`
                  : styles.searchField
              }
            >
              <input
                ref={searchRef}
                type="text"
                placeholder="Search... (/)"
                aria-label="Search"
                autoComplete="off"
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </span>
            {showNavSuggest && (
              <div
                ref={suggestRef}
                className={styles.navSuggest}
                role="listbox"
                aria-label="Recent searches"
              >
                {navSuggestions.map((h) => (
                  <div key={h} className={styles.navSuggestRow}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className={styles.navSuggestItem}
                      // mousedown fires before blur: prevent the default so
                      // the input keeps focus and the click is not swallowed.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(h)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15.5 14" />
                      </svg>
                      <span>{h}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.navSuggestRemove}
                      aria-label={`Remove "${h}" from search history`}
                      title="Remove from history"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeSuggestion(h)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

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
          <AccountButton />

          {isAuthenticated && (
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
          )}

          {isAuthenticated && <Notifications />}
        </div>
      </nav>

      <button
        ref={hamburgerRef}
        className={styles.sidebarHamburger}
        onClick={() =>
          setMenuOpen((previous) => !previous)
        }
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        aria-controls="sidebar-menu"
      >
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
      </button>

      {menuOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar-menu"
        className={[
          styles.sidebar,
          menuOpen
            ? styles.sidebarOpen
            : '',
        ].join(' ')}
        ref={sidebarRef}
        inert={!menuOpen}
        aria-label="Sidebar navigation"
      >
        <nav className={styles.sidebarNav}>
          {PUBLIC_NAV_ITEMS.map((item, index) => (
            <Link
              key={item.to}
              to={item.to}
              ref={index === 0 ? firstSidebarLinkRef : undefined}
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

          {isAuthenticated && PERSONAL_NAV_ITEMS.map((item, index) => (
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
                animationDelay: `${(PUBLIC_NAV_ITEMS.length + index) * 50}ms`,
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

          {isAuthenticated && (
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
          )}

          <AccountButton sidebar />
        </nav>

        {isAuthenticated && (
          <div className={styles.sidebarNotif}>
            <Notifications sidebar />
          </div>
        )}

        <form
          className={styles.sidebarSearch}
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            placeholder="Search..."
            aria-label="Search"
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
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