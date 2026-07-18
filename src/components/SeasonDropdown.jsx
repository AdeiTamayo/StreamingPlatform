import { useState, useRef, useEffect, useMemo } from 'react';

export default function SeasonDropdown({ seasons, value, onSelect }) {
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
