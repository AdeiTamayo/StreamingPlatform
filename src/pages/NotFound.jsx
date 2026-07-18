import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  useEffect(() => { document.title = '404 - StreamFlow'; }, []);

  return (
    <div className="page">
      <div className="empty-state">
        <h3>Page not found</h3>
        <p>The page you're looking for doesn't exist.</p>
        <Link to="/" className="empty-state-action">Go home</Link>
      </div>
    </div>
  );
}
