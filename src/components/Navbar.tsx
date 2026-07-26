import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useClickOutside from '../hooks/useClickOutside';
import styles from './Navbar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/watch-later', label: 'Watch Later' },
  { to: '/last-seen', label: 'Last Seen' },
  { to: '/settings', label: 'Settings' },
];

export default function Navbar() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useClickOutside(() => { if (menuOpen) setMenuOpen(false); });
  const searchRef = useRef(null);
  const lastScrollRef = useRef(0);
  const searchBtnRef = useRef(null);
  const goBtnRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', menuOpen);
    return () => document.body.classList.remove('sidebar-open');
  }, [menuOpen]);

  useEffect(() => {
    function handleScroll() {
      const currentScroll = window.scrollY;
      setScrolled(currentScroll > 10);
      if (currentScroll > 100) {
        setHidden(currentScroll > lastScrollRef.current);
      } else {
        setHidden(false);
      }
      lastScrollRef.current = currentScroll;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
    function handleClickOutside(e) {
      const isOutsideInput = searchRef.current && !searchRef.current.contains(e.target);
      const isOutsideToggle = searchBtnRef.current && !searchBtnRef.current.contains(e.target);
      const isOutsideGo = goBtnRef.current && !goBtnRef.current.contains(e.target);
      if (isOutsideInput && (isOutsideToggle || !searchBtnRef.current) && (isOutsideGo || !goBtnRef.current)) {
        setSearchOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchOpen]);

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  function toggleSearch() {
    setSearchOpen((s) => !s);
    if (!searchOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }

  return (
    <>
      <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''} ${hidden ? styles.hidden : ''}`}>
        <div className={styles.navbarInner}>
          <div className={styles.navLinks}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className={isActive(item.to) ? styles.active : ''}>
                {item.label}
              </Link>
            ))}
          </div>
          <form className={styles.navbarSearch} onSubmit={handleSubmit}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search... (/)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={searchOpen ? styles.open : ''}
            />
            {!searchOpen && (
              <button ref={searchBtnRef} type="button" className={styles.searchToggleBtn} onClick={toggleSearch}>
                {'\u2315'}
              </button>
            )}
            {searchOpen && (
              <button ref={goBtnRef} type="submit" className={styles.searchGoBtn}>Go</button>
            )}
          </form>
        </div>
      </nav>

      <button className={styles.sidebarHamburger} onClick={() => setMenuOpen((s) => !s)} aria-label="Toggle menu">
        <span className={`${styles.hamburgerLine} ${menuOpen ? styles.open : ''}`} />
        <span className={`${styles.hamburgerLine} ${menuOpen ? styles.open : ''}`} />
        <span className={`${styles.hamburgerLine} ${menuOpen ? styles.open : ''}`} />
      </button>
      {menuOpen && <div className={styles.sidebarOverlay} />}
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`} ref={sidebarRef}>
        <div className={styles.sidebarBrand}>StreamFlow</div>
        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`${styles.sidebarLink} ${isActive(item.to) ? styles.active : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form className={styles.sidebarSearch} onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </aside>
    </>
  );
}
