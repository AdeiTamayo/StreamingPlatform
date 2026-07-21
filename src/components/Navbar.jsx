import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

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
  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const lastScrollRef = useRef(0);
  const searchBtnRef = useRef(null);
  const goBtnRef = useRef(null);
  const formRef = useRef(null);

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
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

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
      <nav className={`navbar ${scrolled ? 'scrolled' : ''} ${hidden ? 'hidden' : ''}`}>
        <div className="navbar-inner">
          <div className="nav-links">
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className={isActive(item.to) ? 'active' : ''}>
                {item.label}
              </Link>
            ))}
          </div>
          <form className="navbar-search" onSubmit={handleSubmit}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search... (/)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={searchOpen ? 'open' : ''}
            />
            {!searchOpen && (
              <button ref={searchBtnRef} type="button" className="search-toggle-btn" onClick={toggleSearch}>
                {'\u2315'}
              </button>
            )}
            {searchOpen && (
              <button ref={goBtnRef} type="submit" className="search-go-btn">Go</button>
            )}
          </form>
        </div>
      </nav>

      <button className="sidebar-hamburger" onClick={() => setMenuOpen((s) => !s)} aria-label="Toggle menu">
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`} />
      </button>
      {menuOpen && <div className="sidebar-overlay" />}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} ref={menuRef}>
        <div className="sidebar-brand">StreamFlow</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar-link ${isActive(item.to) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form className="sidebar-search" onSubmit={handleSubmit}>
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
