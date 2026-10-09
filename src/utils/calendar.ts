export interface CalendarCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  isFuture: boolean;
  dayNumber: number;
  isoString: string;
  accessibleLabel: string;
}

export interface CalendarGrid {
  cells: CalendarCell[];
  year: number;
  month: number;
  monthName: string;
  firstDayOfMonth: Date;
  lastDayOfMonth: Date;
  weeks: CalendarCell[][];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getDayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function createDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

function toISOString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatAccessibleLabel(date: Date, isCurrentMonth: boolean, viewedYear: number, viewedMonth: number): string {
  const dayName = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthName = date.toLocaleDateString(undefined, { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();

  const base = `${dayName}, ${monthName} ${day}, ${year}`;
  if (!isCurrentMonth) {
    if (year < viewedYear || (year === viewedYear && date.getMonth() < viewedMonth)) {
      return `${base}, previous month`;
    }
    return `${base}, next month`;
  }
  return base;
}

export function generateCalendarGrid(
  year: number,
  month: number,
  selectedDate?: string,
  today?: Date,
): CalendarGrid {
  const now = today || new Date();
  const firstDayOfMonth = createDate(year, month, 1);
  const lastDayOfMonth = createDate(year, month + 1, 0);

  const firstDayIndex = getDayIndex(firstDayOfMonth);
  const daysInMonth = lastDayOfMonth.getDate();

  const cells: CalendarCell[] = [];

  const prevMonthLastDay = createDate(year, month, 0);
  const prevMonthDays = prevMonthLastDay.getDate();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const date = createDate(year, month - 1, day);
    cells.push(createCell(date, false, year, month, selectedDate, now));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = createDate(year, month, day);
    cells.push(createCell(date, true, year, month, selectedDate, now));
  }

  // Only render as many complete weeks as needed (4-6) so months that fit
  // in 5 weeks don't show an extra empty trailing week.
  const totalNeeded = firstDayIndex + daysInMonth;
  const weekCount = Math.ceil(totalNeeded / 7);
  const remainingCells = weekCount * 7 - cells.length;

  for (let day = 1; day <= remainingCells; day++) {
    const date = createDate(year, month + 1, day);
    cells.push(createCell(date, false, year, month, selectedDate, now));
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < weekCount; i++) {
    weeks.push(cells.slice(i * 7, (i + 1) * 7));
  }

  return {
    cells,
    year,
    month,
    monthName: MONTHS[month],
    firstDayOfMonth,
    lastDayOfMonth,
    weeks,
  };
}

function createCell(
  date: Date,
  isCurrentMonth: boolean,
  viewedYear: number,
  viewedMonth: number,
  selectedDate?: string,
  today?: Date,
): CalendarCell {
  const isoString = toISOString(date);
  return {
    date,
    isCurrentMonth,
    isToday: isoString === toISOString(today || new Date()),
    isSelected: selectedDate ? isoString === selectedDate : false,
    isPast: date < (today || new Date()),
    isFuture: date > (today || new Date()),
    dayNumber: date.getDate(),
    isoString,
    accessibleLabel: formatAccessibleLabel(date, isCurrentMonth, viewedYear, viewedMonth),
  };
}

export function getMonthName(month: number): string {
  return MONTHS[month];
}

export function getWeekdays(): string[] {
  return [...WEEKDAYS];
}

export function navigateMonth(
  year: number,
  month: number,
  direction: 'prev' | 'next',
): { year: number; month: number } {
  if (direction === 'prev') {
    if (month === 0) {
      return { year: year - 1, month: 11 };
    }
    return { year, month: month - 1 };
  }
  if (month === 11) {
    return { year: year + 1, month: 0 };
  }
  return { year, month: month + 1 };
}

export function parseISODate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function isValidDate(dateStr: string): boolean {
  return parseISODate(dateStr) !== null;
}

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// YYYY-MM-DD of an instant in the given IANA zone - the day a release
// lands on for a viewer there (US Sunday primetime = Monday in Spain).
export function toZonedDateString(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}

export interface TimezoneOption {
  value: string;
  label: string;
}

// Curated IANA zones for the timezone setting (plus a System default).
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Rome', label: 'Rome' },
  { value: 'Europe/Lisbon', label: 'Lisbon' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Europe/Helsinki', label: 'Helsinki' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Europe/Istanbul', label: 'Istanbul' },
  { value: 'Africa/Cairo', label: 'Cairo' },
  { value: 'Africa/Lagos', label: 'Lagos' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/Denver', label: 'Denver' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Anchorage', label: 'Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Honolulu' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Karachi', label: 'Karachi' },
  { value: 'Asia/Kolkata', label: 'Kolkata' },
  { value: 'Asia/Bangkok', label: 'Bangkok' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Australia/Perth', label: 'Perth' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'UTC', label: 'UTC' },
];