import { useMemo, useState, useId } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import type { FilterOption } from '../types';

interface FilterDropdownProps {
  value: string;
  options: FilterOption[];
  placeholder: string;
  onSelect: (value: string) => void;
  className?: string;
}

export default function FilterDropdown({ value, options, placeholder, onSelect, className = '' }: FilterDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useClickOutside(() => setOpen(false));
    const search = useDropdownSearch(open, () => setOpen(false));
    const id = useId();
    const menuId = `fd-menu-${id}`;

    const current = useMemo(() => options.find((option) => option.value === value), [options, value]);

    const filtered = useMemo(() => {
        if (!search) return options;
        return options.filter((o) => o.label.toLowerCase().includes(search));
    }, [options, search]);

    const highlightKey: string | null = search && filtered.length > 0 ? filtered[0].value || filtered[0].label : null;

    return (
        <div className={`custom-select ${className}`.trim()} ref={ref}>
            <button
                className="custom-select-trigger"
                onClick={() => setOpen((state) => !state)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label={current?.label || placeholder}
            >
                <span className="custom-select-trigger-label">{current?.label || placeholder}</span>
                <span className={`cs-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
            </button>
            {open && (
                <div id={menuId} className="custom-select-menu filter-select-menu" role="listbox" aria-label={placeholder}>
                    {filtered.length === 0 && <div className="custom-select-empty" role="status">No matches</div>}
                    {filtered.map((option) => {
                        const key = option.value || option.label;
                        const isHighlighted = key === highlightKey;
                        return (
                            <button
                                key={key}
                                role="option"
                                aria-selected={option.value === value}
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
