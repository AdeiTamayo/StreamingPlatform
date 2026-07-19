import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
    }
  }

  return (
    <nav className="navbar">
      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/movies">Movies</Link>
        <Link to="/tv">TV Shows</Link>
        <Link to="/watch-later">Watch Later</Link>
        <Link to="/last-seen">Last Seen</Link>
      </div>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Search movies & shows..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
    </nav>
  );
}
