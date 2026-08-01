import { useState, useMemo, useId, useCallback } from 'react';
import { getWatchedEpisodeSet } from '../api/storage';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import useDropdownKeys from '../hooks/useDropdownKeys';
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
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);
  const search = useDropdownSearch(open, close);
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
  const activeIndex = useDropdownKeys(open, filtered.length, (i) => {
    const ep = filtered[i];
    if (ep) {
      onSelect(ep.episode_number);
      setOpen(false);
    }
  }, close);

  const watchedSet = useMemo(() => getWatchedEpisodeSet(showId, season), [showId, season]);
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
          {filtered.map((ep, index) => {
            const watched = watchedSet.has(ep.episode_number);
            const isHighlighted = search ? ep.episode_number === highlightNum : index === activeIndex;
            return (
              <button
                key={ep.episode_number}
                role="option"
                aria-selected={ep.episode_number === episode}
                className={`custom-select-item ${ep.episode_number === episode ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''} ${watched ? 'watched' : ''}`}
                onClick={() => { onSelect(ep.episode_number); setOpen(false); }}
              >
                <span className="cs-item-label">
                  <span className="cs-item-num">{ep.episode_number}.</span>
                  {ep.name}
                </span>
                {watched && <span className="cs-check" aria-hidden="true" title="Watched">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
