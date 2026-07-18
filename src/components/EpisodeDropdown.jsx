import { useState, useRef, useEffect, useMemo } from 'react';
import { isWatched } from '../api/storage';

export default function EpisodeDropdown({ showId, season, episode, episodes, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    function handleKey(e) {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'Backspace') { setSearch((s) => s.slice(0, -1)); resetTimer(); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setSearch((s) => (s + e.key).toLowerCase());
        resetTimer();
      }
    }
    function resetTimer() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSearch(''), 1500);
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); clearTimeout(timerRef.current); };
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return episodes;
    return episodes.filter((ep) => {
      const label = `${ep.episode_number} ${ep.name || ''}`.toLowerCase();
      return label.includes(search);
    });
  }, [episodes, search]);

  const highlightNum = search && filtered.length > 0 ? filtered[0].episode_number : null;

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        {(() => { const ep = episodes.find((e) => e.episode_number === episode); return ep ? `${ep.episode_number}. ${ep.name}` : `Episode ${episode}`; })()}
        <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {filtered.length === 0 && <div className="custom-select-empty">No matches</div>}
          {filtered.map((ep) => {
            const watched = isWatched('tv', showId, season, ep.episode_number);
            return (
              <button
                key={ep.episode_number}
                className={`custom-select-item ${ep.episode_number === episode ? 'active' : ''} ${ep.episode_number === highlightNum ? 'highlighted' : ''} ${watched ? 'watched' : ''}`}
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
