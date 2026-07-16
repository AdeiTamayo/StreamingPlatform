import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Settings() {
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();

  function clearAll() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('watched:') || k.startsWith('progress:') || k === 'watchlater' || k.startsWith('tmdb:')) {
        keys.push(k);
      }
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setConfirm(false);
    navigate('/');
  }

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Settings</h2>
        <div className="settings-section">
          <h3>Data</h3>
          {!confirm ? (
            <button className="watch-toggle danger" onClick={() => setConfirm(true)}>
              Clear all local data
            </button>
          ) : (
            <div className="confirm-bar">
              <span className="confirm-text">This removes watched marks, progress, watch later, and cache. Are you sure?</span>
              <button className="watch-toggle danger" onClick={clearAll}>Yes, clear everything</button>
              <button className="watch-toggle" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
