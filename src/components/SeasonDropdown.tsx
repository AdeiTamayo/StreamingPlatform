import { useState, useMemo } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';

export default function SeasonDropdown({ seasons, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const search = useDropdownSearch(open, () => setOpen(false));

  const current = seasons.find((s) => s.season_number === value);

  const filtered = useMemo(() => {
    if (!search) return seasons;
    return seasons.filter((s) => (s.name || `Season ${s.season_number}`).toLowerCase().includes(search));
  }, [seasons, search]);

  const highlightNum = search && filtered.length > 0 ? filtered[0].season_number : null;

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        {current?.name || `Season ${value}`}
        <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {filtered.length === 0 && <div className="custom-select-empty">No matches</div>}
          {filtered.map((s) => (
            <button
              key={s.season_number}
              className={`custom-select-item ${s.season_number === value ? 'active' : ''} ${s.season_number === highlightNum ? 'highlighted' : ''}`}
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
