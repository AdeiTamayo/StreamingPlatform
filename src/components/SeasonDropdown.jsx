import { useState, useRef, useEffect } from 'react';

export default function SeasonDropdown({ seasons, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = seasons.find((s) => s.season_number === value);

  return (
    <div className="custom-select" ref={ref}>
      <button className="custom-select-trigger" onClick={() => setOpen(!open)}>
        {current?.name || `Season ${value}`}
        <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="custom-select-menu">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              className={`custom-select-item ${s.season_number === value ? 'active' : ''}`}
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
