import { useState, useMemo, useId, useCallback } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import useDropdownKeys from '../hooks/useDropdownKeys';
import type { TMDBSeason } from '../types';

interface SeasonDropdownProps {
  seasons: TMDBSeason[];
  value: number;
  onSelect: (seasonNumber: number) => void;
}

export default function SeasonDropdown({ seasons, value, onSelect }: SeasonDropdownProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);
  const search = useDropdownSearch(open, close);
  const id = useId();
  const menuId = `sd-menu-${id}`;

  const current = seasons.find((s) => s.season_number === value);

  const filtered = useMemo(() => {
    if (!search) return seasons;
    return seasons.filter((s) => (s.name || `Season ${s.season_number}`).toLowerCase().includes(search));
  }, [seasons, search]);

  const highlightNum: number | null = search && filtered.length > 0 ? filtered[0].season_number : null;
  const activeIndex = useDropdownKeys(open, filtered.length, (i) => {
    const s = filtered[i];
    if (s) {
      onSelect(s.season_number);
      setOpen(false);
    }
  }, close);

  return (
    <div className="custom-select" ref={ref}>
      <button
        className="custom-select-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={current?.name || `Season ${value}`}
      >
        {current?.name || `Season ${value}`}
        <span className={`cs-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <div id={menuId} className="custom-select-menu" role="listbox" aria-label="Select season">
          {filtered.length === 0 && <div className="custom-select-empty" role="status">No matches</div>}
          {filtered.map((s, index) => (
            <button
              key={s.season_number}
              role="option"
              aria-selected={s.season_number === value}
              className={`custom-select-item ${s.season_number === value ? 'active' : ''} ${search ? (s.season_number === highlightNum ? 'highlighted' : '') : index === activeIndex ? 'highlighted' : ''}`}
              onClick={() => { onSelect(s.season_number); setOpen(false); }}
            >
              {s.name || `Season ${s.season_number}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
