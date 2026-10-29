import { useMemo, useState, useId, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import useDropdownKeys from '../hooks/useDropdownKeys';
import type { FilterOption } from '../types';

interface FilterDropdownProps {
  value: string;
  options: FilterOption[];
  placeholder: string;
  onSelect: (value: string) => void;
  className?: string;
  /** Optional trailing icon shown instead of the chevron. */
  icon?: ReactNode;
}

export default function FilterDropdown({ value, options, placeholder, onSelect, className = '', icon }: FilterDropdownProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const ref = useClickOutside(close);
    const search = useDropdownSearch(open, close);
    const id = useId();
    const menuId = `fd-menu-${id}`;

    const current = useMemo(() => options.find((option) => option.value === value), [options, value]);

    const filtered = useMemo(() => {
        if (!search) return options;
        return options.filter((o) => o.label.toLowerCase().includes(search));
    }, [options, search]);

    const highlightKey: string | null = search && filtered.length > 0 ? filtered[0].value || filtered[0].label : null;
    const activeIndex = useDropdownKeys(open, filtered.length, (i) => {
        const option = filtered[i];
        if (option) {
            onSelect(option.value);
            setOpen(false);
        }
    }, close);

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
                <span className="custom-select-trigger-label">
                    {current?.icon && (
                        <img
                            className="cs-option-icon"
                            src={current.icon}
                            alt=""
                            aria-hidden="true"
                        />
                    )}
                    {current?.label || placeholder}
                </span>
                {icon ? (
                    <span className="custom-select-trigger-icon" aria-hidden="true">{icon}</span>
                ) : (
                    <span className={`cs-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
                )}
            </button>
            {open && (
                <div id={menuId} className="custom-select-menu filter-select-menu" role="listbox" aria-label={placeholder}>
                    {filtered.length === 0 && <div className="custom-select-empty" role="status">{t('common.noMatches')}</div>}
                    {filtered.map((option, index) => {
                        const key = option.value || option.label;
                        const isHighlighted = search ? key === highlightKey : index === activeIndex;
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
                                <span className="cs-item-label">
                                    {option.icon && (
                                        <img
                                            className="cs-option-icon"
                                            src={option.icon}
                                            alt=""
                                            aria-hidden="true"
                                        />
                                    )}
                                    {option.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
