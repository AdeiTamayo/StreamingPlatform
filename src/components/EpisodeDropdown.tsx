import { useState, useMemo, useId } from 'react';
import { getWatchedEpisodeSet } from '../api/storage';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import type { TMDBEpisode } from '../types';

interface EpisodeDropdownProps {
  showId: number | string;
  season: number;
  episode: number;
  episodes: TMDBEpisode[];
  onSelect: (episodeNumber: number) => void;
}

export default function EpisodeDropdown({ showId, season, episode, episodes, onSelect }: EpisodeDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const search = useDropdownSearch(open, () => setOpen(false));
  const id = useId();
  const menuId = `ed-menu-${id}`;

  const filtered = useMemo(() => {
    if (!search) return episodes;
    return episodes.filter((ep) => {
      const label = `${ep.episode_number} ${ep.name || ''}`.toLowerCase();
      return label.includes(search);
    });
  }, [episodes, search]);

  const highlightNum: number | null = search && filtered.length > 0 ? filtered[0].episode_number : null;

  const watchedSet = useMemo(() => getWatchedEpisodeSet('tv', showId, season), [showId, season]);
  const current = episodes.find((e) => e.episode_number === episode);
  const triggerLabel = current ? `${current.episode_number}. ${current.name}` : `Episode ${episode}`;

  return (
    <div className="custom-select" ref={ref}>
      <button
        className="custom-select-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerLabel}
      >
        {triggerLabel}
        <span className={`cs-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <div id={menuId} className="custom-select-menu" role="listbox" aria-label="Select episode">
          {filtered.length === 0 && <div className="custom-select-empty" role="status">No matches</div>}
          {filtered.map((ep) => {
            const watched = watchedSet.has(ep.episode_number);
            return (
              <button
                key={ep.episode_number}
                role="option"
                aria-selected={ep.episode_number === episode}
                className={`custom-select-item ${ep.episode_number === episode ? 'active' : ''} ${ep.episode_number === highlightNum ? 'highlighted' : ''} ${watched ? 'watched' : ''}`}
                onClick={() => { onSelect(ep.episode_number); setOpen(false); }}
              >
                <span className="cs-item-label">
                  <span className="cs-item-num">{ep.episode_number}.</span>
                  {ep.name}
                </span>
                {watched && <span className="cs-check" aria-label="Watched">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
