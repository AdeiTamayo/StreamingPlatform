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
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef(null);
  const menuRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
      setMenuOpen(false);
    }
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        searchRef.current?.focus();
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

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <>
      {/* Desktop top navbar */}
      <nav className="navbar">
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
          />
          <button type="submit">Search</button>
        </form>
      </nav>

      {/* Mobile hamburger + sidebar drawer */}
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
