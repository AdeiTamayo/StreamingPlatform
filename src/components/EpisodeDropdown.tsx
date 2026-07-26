import { useState, useMemo } from 'react';
import { isWatched } from '../api/storage';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';

export default function EpisodeDropdown({ showId, season, episode, episodes, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const search = useDropdownSearch(open, () => setOpen(false));

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
