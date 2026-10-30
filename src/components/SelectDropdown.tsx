import { useState, useMemo, useId, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import useClickOutside from '../hooks/useClickOutside';
import useDropdownSearch from '../hooks/useDropdownSearch';
import useDropdownKeys from '../hooks/useDropdownKeys';
import styles from './SelectDropdown.module.css';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Text matched by the typeahead buffer; defaults to `label`. */
  searchText?: string;
  /** Extra class applied to the option row (e.g. `watched`). */
  className?: string;
  /** Custom row content; defaults to `label`. */
  node?: ReactNode;
  /** Right-aligned accessory (e.g. the watched check). */
  trailing?: ReactNode;
}

interface SelectDropdownProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  className?: string;
  menuLabel?: string;
  triggerLabel?: string;
}

/**
 * Single listbox implementation shared by SeasonDropdown and
 * EpisodeDropdown (FilterDropdown keeps its own for now).
 *
 * The trigger stays focused while the menu is open and points at the active
 * option with `aria-activedescendant`; the option rows are non-tabbable
 * (`tabIndex={-1}`) and are driven by arrow keys / typeahead through
 * useDropdownKeys. Highlight (`highlighted`) is always derived from the same
 * `activeIndex` the Enter key activates, so the visually highlighted row is
 * exactly the one that gets selected.
 */
export default function SelectDropdown<T extends string | number>({
  value,
  options,
  onSelect,
  placeholder,
  className = '',
  menuLabel,
  triggerLabel,
}: SelectDropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);
  const search = useDropdownSearch(open, close);
  const id = useId();
  const menuId = `${id}-menu`;
  const optionId = (index: number) => `${id}-opt-${index}`;

  const current = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    return options.filter((option) => (option.searchText ?? option.label).toLowerCase().includes(search));
  }, [options, search]);

  const activeIndex = useDropdownKeys(open, filtered.length, (i) => {
    const option = filtered[i];
    if (option) {
      onSelect(option.value);
      setOpen(false);
    }
  }, close);

  const label = triggerLabel ?? current?.label ?? placeholder ?? '';
  const activeDescendant = open && filtered[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className={`custom-select ${className}`.trim()} ref={ref}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={activeDescendant}
        aria-label={label}
      >
        <span className="custom-select-trigger-label">{label}</span>
        <span className={`cs-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <div id={menuId} className="custom-select-menu" role="listbox" aria-label={menuLabel}>
          {filtered.length === 0 && <div className="custom-select-empty" role="status">{t('common.noMatches')}</div>}
          {filtered.map((option, index) => {
            const selected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <div
                key={String(option.value)}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={`custom-select-item ${styles.option} ${selected ? 'active' : ''} ${isActive ? 'highlighted' : ''} ${option.className ?? ''}`.trim()}
                onClick={() => { onSelect(option.value); setOpen(false); }}
              >
                {option.node ?? option.label}
                {option.trailing}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
