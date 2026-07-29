import { useEffect, useMemo, useState } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import styles from './DatePickerField.module.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toDateString(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateString(value: string): Date | null {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthCells(viewDate: Date): (Date | null)[] {
    const firstDay = startOfMonth(viewDate);
    const offset = firstDay.getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];

    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    }

    return cells;
}

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function DatePickerField({ label, value, onChange, placeholder }: DatePickerFieldProps) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<'day' | 'month' | 'year'>('day');
    const [viewDate, setViewDate] = useState(() => parseDateString(value) || new Date());
    const ref = useClickOutside(() => setOpen(false));

    useEffect(() => {
        const parsed = parseDateString(value);
        if (parsed) setViewDate(parsed);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open]);

    const selectedDate = useMemo(() => parseDateString(value), [value]);
    const today = new Date();
    const todayString = toDateString(today);
    const monthCells = useMemo(() => buildMonthCells(viewDate), [viewDate]);
    const yearRangeStart = Math.floor(viewDate.getFullYear() / 20) * 20;

    function selectDate(date: Date) {
        onChange(toDateString(date));
        setViewDate(date);
        setOpen(false);
        setView('day');
    }

    function openPicker() {
        setView('day');
        setOpen((s) => !s);
    }

    return (
        <div className={styles.datePicker} ref={ref}>
            <button className={styles.datePickerTrigger} onClick={openPicker}>
                <span className={styles.datePickerInlineLabel}>{label}</span>
                <span className={`${styles.datePickerValue} ${value ? '' : styles.empty}`}>{value || placeholder}</span>
                <span className={styles.datePickerIcon}>&#128197;</span>
            </button>
            {open && (
                <div className={styles.datePickerPopover}>
                    {view === 'day' && (
                        <>
                            <div className={styles.datePickerHeader}>
                                <button className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>&#10094;</button>
                                <button className={styles.datePickerMonth} onClick={() => setView('month')}>
                                    {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </button>
                                <button className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>&#10095;</button>
                            </div>
                            <div className={styles.datePickerWeekdays}>
                                {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                            </div>
                            <div className={styles.datePickerGrid}>
                                {monthCells.map((day, index) => {
                                    if (!day) return <span key={`empty-${index}`} className={`${styles.datePickerCell} ${styles.empty}`} />;
                                    const dayString = toDateString(day);
                                    const isSelected = selectedDate && dayString === toDateString(selectedDate);
                                    const isToday = dayString === todayString;
                                    return (
                                        <button
                                            key={dayString}
                                            className={`${styles.datePickerCell} ${isSelected ? styles.selected : ''} ${isToday ? styles.today : ''}`}
                                            onClick={() => selectDate(day)}
                                        >
                                            {day.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {view === 'month' && (
                        <>
                            <div className={styles.datePickerHeader}>
                                <button className={styles.datePickerNav} onClick={() => setView('year')}>&#10094;</button>
                                <button className={styles.datePickerMonth} onClick={() => setView('year')}>
                                    {viewDate.getFullYear()}
                                </button>
                                <span className={styles.datePickerNav} />
                            </div>
                            <div className={`${styles.datePickerGrid} ${styles.months}`}>
                                {MONTHS.map((name, i) => {
                                    const isCurrent = i === viewDate.getMonth();
                                    return (
                                        <button
                                            key={name}
                                            className={`${styles.datePickerCell} ${isCurrent ? styles.selected : ''}`}
                                            onClick={() => {
                                                setViewDate((c) => new Date(c.getFullYear(), i, 1));
                                                setView('day');
                                            }}
                                        >
                                            {name}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {view === 'year' && (
                        <>
                            <div className={styles.datePickerHeader}>
                                <button className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() - 20, c.getMonth(), 1))}>&#10094;</button>
                                <span className={styles.datePickerMonth}>
                                    {yearRangeStart} – {yearRangeStart + 19}
                                </span>
                                <button className={styles.datePickerNav} onClick={() => setViewDate((c) => new Date(c.getFullYear() + 20, c.getMonth(), 1))}>&#10095;</button>
                            </div>
                            <div className={`${styles.datePickerGrid} ${styles.years}`}>
                                {Array.from({ length: 20 }, (_, i) => yearRangeStart + i).map((yr) => {
                                    const isCurrent = yr === viewDate.getFullYear();
                                    return (
                                        <button
                                            key={yr}
                                            className={`${styles.datePickerCell} ${isCurrent ? styles.selected : ''}`}
                                            onClick={() => {
                                                setViewDate((c) => new Date(yr, c.getMonth(), 1));
                                                setView('month');
                                            }}
                                        >
                                            {yr}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className={styles.datePickerFooter}>
                        <button className={styles.datePickerAction} onClick={() => { onChange(''); setOpen(false); setView('day'); }}>Clear</button>
                        <button className={`${styles.datePickerAction} ${styles.primary}`} onClick={() => { onChange(toDateString(new Date())); setOpen(false); setView('day'); }}>Today</button>
                    </div>
                </div>
            )}
        </div>
    );
}
