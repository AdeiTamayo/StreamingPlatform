import { useEffect, useMemo, useRef, useState } from 'react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value) {
    return String(value).padStart(2, '0');
}

function toDateString(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateString(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthCells(viewDate) {
    const firstDay = startOfMonth(viewDate);
    const offset = firstDay.getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    }

    return cells;
}

export default function DatePickerField({ label, value, onChange, placeholder }) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('day');
    const [viewDate, setViewDate] = useState(() => parseDateString(value) || new Date());
    const ref = useRef(null);

    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        const parsed = parseDateString(value);
        if (parsed) setViewDate(parsed);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        function handleKey(e) {
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

    function selectDate(date) {
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
        <div className="date-picker" ref={ref}>
            <button className="date-picker-trigger" onClick={openPicker}>
                <span className="date-picker-inline-label">{label}</span>
                <span className={`date-picker-value ${value ? '' : 'empty'}`}>{value || placeholder}</span>
                <span className="date-picker-icon">&#128197;</span>
            </button>
            {open && (
                <div className="date-picker-popover">
                    {view === 'day' && (
                        <>
                            <div className="date-picker-header">
                                <button className="date-picker-nav" onClick={() => setViewDate((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>&#10094;</button>
                                <button className="date-picker-month" onClick={() => setView('month')}>
                                    {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </button>
                                <button className="date-picker-nav" onClick={() => setViewDate((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>&#10095;</button>
                            </div>
                            <div className="date-picker-weekdays">
                                {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                            </div>
                            <div className="date-picker-grid">
                                {monthCells.map((day, index) => {
                                    if (!day) return <span key={`empty-${index}`} className="date-picker-cell empty" />;
                                    const dayString = toDateString(day);
                                    const isSelected = selectedDate && dayString === toDateString(selectedDate);
                                    const isToday = dayString === todayString;
                                    return (
                                        <button
                                            key={dayString}
                                            className={`date-picker-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
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
                            <div className="date-picker-header">
                                <button className="date-picker-nav" onClick={() => setView('year')}>&#10094;</button>
                                <button className="date-picker-month" onClick={() => setView('year')}>
                                    {viewDate.getFullYear()}
                                </button>
                                <span className="date-picker-nav" />
                            </div>
                            <div className="date-picker-grid months">
                                {MONTHS.map((name, i) => {
                                    const isCurrent = i === viewDate.getMonth();
                                    return (
                                        <button
                                            key={name}
                                            className={`date-picker-cell month-cell ${isCurrent ? 'selected' : ''}`}
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
                            <div className="date-picker-header">
                                <button className="date-picker-nav" onClick={() => setViewDate((c) => new Date(c.getFullYear() - 20, c.getMonth(), 1))}>&#10094;</button>
                                <span className="date-picker-month">
                                    {yearRangeStart} – {yearRangeStart + 19}
                                </span>
                                <button className="date-picker-nav" onClick={() => setViewDate((c) => new Date(c.getFullYear() + 20, c.getMonth(), 1))}>&#10095;</button>
                            </div>
                            <div className="date-picker-grid years">
                                {Array.from({ length: 20 }, (_, i) => yearRangeStart + i).map((yr) => {
                                    const isCurrent = yr === viewDate.getFullYear();
                                    return (
                                        <button
                                            key={yr}
                                            className={`date-picker-cell year-cell ${isCurrent ? 'selected' : ''}`}
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

                    <div className="date-picker-footer">
                        <button className="date-picker-action" onClick={() => { onChange(''); setOpen(false); setView('day'); }}>Clear</button>
                        <button className="date-picker-action primary" onClick={() => { onChange(toDateString(new Date())); setOpen(false); setView('day'); }}>Today</button>
                    </div>
                </div>
            )}
        </div>
    );
}
