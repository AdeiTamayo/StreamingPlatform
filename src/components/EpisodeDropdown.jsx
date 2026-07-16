import { useState, useRef, useEffect } from 'react';
import { isWatched } from '../api/storage';

export default function EpisodeDropdown({ showId, season, episode, episodes, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        {episodes.find((e) => e.episode_number === episode)?.name || `Episode ${episode}`}
        <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {episodes.map((ep) => {
            const watched = isWatched('tv', showId, season, ep.episode_number);
            return (
              <button
                key={ep.episode_number}
                className={`custom-select-item ${ep.episode_number === episode ? 'active' : ''} ${watched ? 'watched' : ''}`}
                onClick={() => { onSelect(ep.episode_number); setOpen(false); }}
              >
                <span className="cs-item-label">
                  <span className="cs-item-num">{ep.episode_number}.</span>
                  {ep.name}
                </span>
                {watched && <span className="cs-check">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
