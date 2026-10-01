import { useEffect, useMemo, useRef, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import { generateCalendarGrid, getWeekdays, getMonthName, navigateMonth, formatISODate, parseISODate } from '../utils/calendar';
import styles from './DatePickerField.module.css';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function DatePickerField({ label, value, onChange, placeholder }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'day' | 'month' | 'year'>('day');
  const [viewDate, setViewDate] = useState(() => {
    const parsed = parseISODate(value);
    return parsed || new Date();
  });
  const [focusedCellIndex, setFocusedCellIndex] = useState(-1);
  const ref = useClickOutside(() => setOpen(false));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseISODate(value);
    if (parsed) setViewDate(parsed);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Move focus into the grid on open / view switch (never on month
  // navigation, so keyboard users don't lose their place on the nav buttons).
  // Focus the selected day, else today, else the first cell, and sync the
  // roving tabindex so the grid always offers exactly one tab stop.
  useEffect(() => {
    if (!open || view !== 'day' || !gridRef.current) return;
    const buttons = gridRef.current.querySelectorAll('button');
    if (buttons.length === 0) return;
    let target = 0;
    const selectedIdx = calendarGrid.cells.findIndex((c) => c.isSelected);
    if (selectedIdx >= 0) target = selectedIdx;
    else {
      const todayIdx = calendarGrid.cells.findIndex((c) => c.isToday);
      if (todayIdx >= 0) target = todayIdx;
    }
    setFocusedCellIndex(target);
    (buttons[target] as HTMLElement)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  const today = useMemo(() => new Date(), []);
  const calendarGrid = useMemo(
    () => generateCalendarGrid(viewDate.getFullYear(), viewDate.getMonth(), value || undefined, today),
    [viewDate, value, today],
  );
  const yearRangeStart = Math.floor(viewDate.getFullYear() / 20) * 20;
  const weekdays = getWeekdays();

  function selectDate(date: Date) {
    onChange(formatISODate(date));
    setViewDate(date);
    setOpen(false);
    setView('day');
    triggerRef.current?.focus();
  }

  function handleCellKeyDown(e: React.KeyboardEvent, index: number, cell: { isoString: string; date: Date }) {
    const totalCells = calendarGrid.cells.length;
    let newIndex = index;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (index + 1) % totalCells;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = (index - 1 + totalCells) % totalCells;
        break;
      case 'ArrowDown':
        e.preventDefault();
        newIndex = Math.min(index + 7, totalCells - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        newIndex = Math.max(index - 7, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = Math.floor(index / 7) * 7;
        break;
      case 'End':
        e.preventDefault();
        newIndex = Math.min(Math.floor(index / 7) * 7 + 6, totalCells - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectDate(cell.date);
        return;
      case 'Escape':
        setOpen(false);
        triggerRef.current?.focus();
        return;
      default:
        return;
    }
    const nextButton = gridRef.current?.querySelectorAll('button')[newIndex] as HTMLElement;
    nextButton?.focus();
    setFocusedCellIndex(newIndex);
  }

  function openPicker() {
    setView('day');
    setOpen((s) => !s);
  }

  return (
    <div className={styles.datePicker} ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.datePickerTrigger}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value || placeholder}`}
      >
        <span className={styles.datePickerInlineLabel}>{label}</span>
        <span className={`${styles.datePickerValue} ${value ? '' : styles.empty}`}>{value || placeholder}</span>
        <span className={styles.datePickerIcon} aria-hidden="true">&#128197;</span>
      </button>
      {open && (
        <div className={styles.datePickerPopover} role="dialog" aria-label={`${label} picker`}>
          {view === 'day' && (
            <>
              <div className={styles.datePickerHeader}>
                <button
                  type="button"
                  className={styles.datePickerNav}
                  onClick={() => {
                    const { year, month } = navigateMonth(viewDate.getFullYear(), viewDate.getMonth(), 'prev');
                    setViewDate(new Date(year, month, 1));
                  }}
                  aria-label={`Previous month, ${getMonthName(viewDate.getMonth() === 0 ? 11 : viewDate.getMonth() - 1)} ${viewDate.getMonth() === 0 ? viewDate.getFullYear() - 1 : viewDate.getFullYear()}`}
                >
                  &#10094;
                </button>
                <button
                  type="button"
                  className={styles.datePickerMonth}
                  onClick={() => setView('month')}
                >
                  {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </button>
                <button
                  type="button"
                  className={styles.datePickerNav}
                  onClick={() => {
                    const { year, month } = navigateMonth(viewDate.getFullYear(), viewDate.getMonth(), 'next');
                    setViewDate(new Date(year, month, 1));
                  }}
                  aria-label={`Next month, ${getMonthName(viewDate.getMonth() === 11 ? 0 : viewDate.getMonth() + 1)} ${viewDate.getMonth() === 11 ? viewDate.getFullYear() + 1 : viewDate.getFullYear()}`}
                >
                  &#10095;
                </button>
              </div>
              <div className={styles.datePickerWeekdays} aria-hidden="true">
                {weekdays.map((weekday, i) => <span key={`${weekday}-${i}`}>{weekday}</span>)}
              </div>
              <div className={styles.datePickerGrid} ref={gridRef}>
                {calendarGrid.cells.map((cell, index) => (
                  <button
                    key={cell.isoString}
                    type="button"
                    className={`${styles.datePickerCell} ${cell.isSelected ? styles.selected : ''} ${cell.isToday ? styles.today : ''} ${!cell.isCurrentMonth ? styles.adjacentMonth : ''}`}
                    onClick={() => selectDate(cell.date)}
                    onKeyDown={(e) => handleCellKeyDown(e, index, cell)}
                    aria-pressed={cell.isSelected}
                    aria-label={cell.accessibleLabel}
                    tabIndex={index === focusedCellIndex ? 0 : -1}
                  >
                    {cell.dayNumber}
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'month' && (
            <>
              <div className={styles.datePickerHeader}>
                <button type="button" className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() - 1, c.getMonth(), 1))}>&#10094;</button>
                <button type="button" className={styles.datePickerMonth} onClick={() => setView('year')}>
                  {viewDate.getFullYear()}
                </button>
                <button type="button" className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() + 1, c.getMonth(), 1))}>&#10095;</button>
              </div>
              <div className={`${styles.datePickerGrid} ${styles.months}`}>
                {getMonthName(0).slice(0, 3) && Array.from({ length: 12 }, (_, i) => {
                  const isCurrent = i === viewDate.getMonth();
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.datePickerCell} ${isCurrent ? styles.selected : ''}`}
                      onClick={() => {
                        setViewDate((c) => new Date(c.getFullYear(), i, 1));
                        setView('day');
                      }}
                      aria-pressed={isCurrent}
                      aria-label={getMonthName(i)}
                    >
                      {getMonthName(i).slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === 'year' && (
            <>
              <div className={styles.datePickerHeader}>
                <button type="button" className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() - 20, c.getMonth(), 1))}>&#10094;</button>
                <span className={styles.datePickerMonth}>
                  {yearRangeStart} – {yearRangeStart + 19}
                </span>
                <button type="button" className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() + 20, c.getMonth(), 1))}>&#10095;</button>
              </div>
              <div className={`${styles.datePickerGrid} ${styles.years}`}>
                {Array.from({ length: 20 }, (_, i) => yearRangeStart + i).map((yr) => {
                  const isCurrent = yr === viewDate.getFullYear();
                  return (
                    <button
                      key={yr}
                      type="button"
                      className={`${styles.datePickerCell} ${isCurrent ? styles.selected : ''}`}
                      onClick={() => {
                        setViewDate((c) => new Date(yr, c.getMonth(), 1));
                        setView('month');
                      }}
                      aria-pressed={isCurrent}
                      aria-label={String(yr)}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className={styles.datePickerFooter}>
            <button type="button" className={styles.datePickerAction} onClick={() => { onChange(''); setOpen(false); setView('day'); triggerRef.current?.focus(); }}>Clear</button>
            <button type="button" className={`${styles.datePickerAction} ${styles.primary}`} onClick={() => { onChange(formatISODate(new Date())); setOpen(false); setView('day'); triggerRef.current?.focus(); }}>Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
