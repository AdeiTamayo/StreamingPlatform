import { useState, useRef, useEffect } from 'react';
import { isWatched } from '../api/storage';

export default function EpisodeDropdown({ showId, season, episode, episodeCount, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const episodes = Array.from({ length: episodeCount }, (_, i) => i + 1);

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        Episode {episode}
        <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {episodes.map((ep) => {
            const watched = isWatched('tv', showId, season, ep);
            return (
              <button
                key={ep}
                className={`custom-select-item ${ep === episode ? 'active' : ''} ${watched ? 'watched' : ''}`}
                onClick={() => { onSelect(ep); setOpen(false); }}
              >
                <span>Episode {ep}</span>
                {watched && <span className="cs-check">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
