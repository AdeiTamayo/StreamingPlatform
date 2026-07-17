import { useEffect, useMemo, useRef, useState } from 'react';

export default function FilterDropdown({ value, options, placeholder, onSelect, className = '' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const current = useMemo(() => options.find((option) => option.value === value), [options, value]);

    return (
        <div className={`custom-select ${className}`.trim()} ref={ref}>
            <button className="custom-select-trigger" onClick={() => setOpen((state) => !state)}>
                <span className="custom-select-trigger-label">{current?.label || placeholder}</span>
                <span className={`cs-arrow ${open ? 'open' : ''}`}>&#9662;</span>
            </button>
            {open && (
                <div className="custom-select-menu filter-select-menu">
                    {options.map((option) => (
                        <button
                            key={option.value || option.label}
                            className={`custom-select-item ${option.value === value ? 'active' : ''}`}
                            onClick={() => {
                                onSelect(option.value);
                                setOpen(false);
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}