import { useState, useMemo, useId } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';

export default function SeasonDropdown({ seasons, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const search = useDropdownSearch(open, () => setOpen(false));
  const id = useId();
  const menuId = `sd-menu-${id}`;

  const current = seasons.find((s) => s.season_number === value);

  const filtered = useMemo(() => {
    if (!search) return seasons;
    return seasons.filter((s) => (s.name || `Season ${s.season_number}`).toLowerCase().includes(search));
  }, [seasons, search]);

  const highlightNum = search && filtered.length > 0 ? filtered[0].season_number : null;

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
          {filtered.map((s) => (
            <button
              key={s.season_number}
              role="option"
              aria-selected={s.season_number === value}
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
