import { useEffect, useMemo, useRef, useState } from 'react';

export default function FilterDropdown({ value, options, placeholder, onSelect, className = '' }) {
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

    const current = useMemo(() => options.find((option) => option.value === value), [options, value]);

    const filtered = useMemo(() => {
        if (!search) return options;
        return options.filter((o) => o.label.toLowerCase().includes(search));
    }, [options, search]);

    const highlightKey = search && filtered.length > 0 ? filtered[0].value || filtered[0].label : null;

    return (
        <div className={`custom-select ${className}`.trim()} ref={ref}>
            <button className="custom-select-trigger" onClick={() => setOpen((state) => !state)}>
                <span className="custom-select-trigger-label">{current?.label || placeholder}</span>
                <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
            </button>
            {open && (
                <div className="custom-select-menu filter-select-menu">
                    {filtered.length === 0 && <div className="custom-select-empty">No matches</div>}
                    {filtered.map((option) => {
                        const key = option.value || option.label;
                        const isHighlighted = key === highlightKey;
                        return (
                            <button
                                key={key}
                                className={`custom-select-item ${option.value === value ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                                onClick={() => {
                                    onSelect(option.value);
                                    setOpen(false);
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
