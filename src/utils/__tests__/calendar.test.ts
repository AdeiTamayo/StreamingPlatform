import { describe, it, expect } from 'vitest';
import {
  generateCalendarGrid,
  parseISODate,
  isValidDate,
  formatISODate,
  navigateMonth,
  getWeekdays,
  getMonthName,
  toZonedDateString,
  isValidTimezone,
  getSystemTimezone,
  TIMEZONE_OPTIONS,
} from '../calendar';

describe('calendar utility', () => {
  describe('generateCalendarGrid', () => {
    it('generates grid for month starting on Wednesday with two previous-month dates (January 2025)', () => {
      const grid = generateCalendarGrid(2025, 0);
      expect(grid.cells).toHaveLength(35);
      expect(grid.weeks).toHaveLength(5);
      expect(grid.monthName).toBe('January');
      expect(grid.year).toBe(2025);
      expect(grid.month).toBe(0);

      // Jan 1, 2025 is Wednesday, so grid starts on Mon Dec 30, 2024
      expect(grid.cells[0].dayNumber).toBe(30);
      expect(grid.cells[0].isCurrentMonth).toBe(false);
      expect(grid.cells[0].date.getMonth()).toBe(11);
      expect(grid.cells[0].date.getFullYear()).toBe(2024);
      expect(grid.cells[1].dayNumber).toBe(31);
      expect(grid.cells[1].isCurrentMonth).toBe(false);
      expect(grid.cells[2].dayNumber).toBe(1);
      expect(grid.cells[2].isCurrentMonth).toBe(true);
      expect(grid.cells[2].date.getDay()).toBe(3);
    });

    it('generates grid for month starting on Saturday with five previous-month dates (February 2025)', () => {
      const grid = generateCalendarGrid(2025, 1);
      expect(grid.cells).toHaveLength(35);

      // Feb 1, 2025 is Saturday, so grid starts on Mon Jan 27, 2025
      expect(grid.cells[0].dayNumber).toBe(27);
      expect(grid.cells[0].isCurrentMonth).toBe(false);
      expect(grid.cells[0].date.getMonth()).toBe(0);
      expect(grid.cells[4].dayNumber).toBe(31);
      expect(grid.cells[4].isCurrentMonth).toBe(false);
      expect(grid.cells[5].dayNumber).toBe(1);
      expect(grid.cells[5].isCurrentMonth).toBe(true);
    });

    it('generates grid for month starting on Saturday with five previous-month dates (March 2025)', () => {
      const grid = generateCalendarGrid(2025, 2);
      expect(grid.cells).toHaveLength(42);

      // Mar 1, 2025 is Saturday, so grid starts on Mon Feb 24, 2025
      expect(grid.cells[0].dayNumber).toBe(24);
      expect(grid.cells[0].isCurrentMonth).toBe(false);
      expect(grid.cells[0].date.getMonth()).toBe(1);
      expect(grid.cells[4].dayNumber).toBe(28);
      expect(grid.cells[4].isCurrentMonth).toBe(false);
      expect(grid.cells[5].dayNumber).toBe(1);
      expect(grid.cells[5].isCurrentMonth).toBe(true);
    });

    it('generates grid for month ending mid-week with next-month dates (April 2025)', () => {
      const grid = generateCalendarGrid(2025, 3);
      expect(grid.cells).toHaveLength(35);

      const lastCurrentMonthIndex = grid.cells.map((c) => c.isCurrentMonth).lastIndexOf(true);
      expect(grid.cells[lastCurrentMonthIndex].dayNumber).toBe(30);
      expect(grid.cells[lastCurrentMonthIndex + 1].dayNumber).toBe(1);
      expect(grid.cells[lastCurrentMonthIndex + 1].isCurrentMonth).toBe(false);
      expect(grid.cells[lastCurrentMonthIndex + 1].date.getMonth()).toBe(4);
    });

    it('generates grid for leap year February (February 2024)', () => {
      const grid = generateCalendarGrid(2024, 1);
      expect(grid.cells).toHaveLength(35);

      const febDays = grid.cells.filter((c) => c.isCurrentMonth);
      expect(febDays).toHaveLength(29);
      expect(febDays[febDays.length - 1].dayNumber).toBe(29);
    });

    it('generates grid for non-leap year February (February 2025)', () => {
      const grid = generateCalendarGrid(2025, 1);
      const febDays = grid.cells.filter((c) => c.isCurrentMonth);
      expect(febDays).toHaveLength(28);
      expect(febDays[febDays.length - 1].dayNumber).toBe(28);
    });

    it('generates grid for December to January transition', () => {
      const grid = generateCalendarGrid(2024, 11);
      expect(grid.cells).toHaveLength(42);
      expect(grid.monthName).toBe('December');
      expect(grid.year).toBe(2024);

      const lastCurrentMonthIndex = grid.cells.map((c) => c.isCurrentMonth).lastIndexOf(true);
      expect(grid.cells[lastCurrentMonthIndex].dayNumber).toBe(31);
      expect(grid.cells[lastCurrentMonthIndex + 1].dayNumber).toBe(1);
      expect(grid.cells[lastCurrentMonthIndex + 1].date.getMonth()).toBe(0);
      expect(grid.cells[lastCurrentMonthIndex + 1].date.getFullYear()).toBe(2025);
    });

    it('includes selected date state', () => {
      const grid = generateCalendarGrid(2025, 0, '2025-01-15');
      const selectedCell = grid.cells.find((c) => c.isSelected);
      expect(selectedCell).toBeDefined();
      expect(selectedCell?.dayNumber).toBe(15);
      expect(selectedCell?.isoString).toBe('2025-01-15');
    });

    it('includes today state', () => {
      const today = new Date(2025, 0, 15);
      const grid = generateCalendarGrid(2025, 0, undefined, today);
      const todayCell = grid.cells.find((c) => c.isToday);
      expect(todayCell).toBeDefined();
      expect(todayCell?.dayNumber).toBe(15);
    });

    it('includes past/future states', () => {
      const today = new Date(2025, 0, 15);
      const grid = generateCalendarGrid(2025, 0, undefined, today);
      const pastCell = grid.cells.find((c) => c.isPast && c.isCurrentMonth);
      const futureCell = grid.cells.find((c) => c.isFuture && c.isCurrentMonth);
      expect(pastCell).toBeDefined();
      expect(futureCell).toBeDefined();
      expect(pastCell?.dayNumber).toBeLessThan(15);
      expect(futureCell?.dayNumber).toBeGreaterThan(15);
    });

    it('provides accessible labels for all cells', () => {
      const grid = generateCalendarGrid(2025, 1);
      for (const cell of grid.cells) {
        expect(cell.accessibleLabel).toBeTruthy();
        expect(cell.accessibleLabel).toContain(cell.dayNumber.toString());
      }
    });

    it('accessible labels distinguish adjacent-month dates', () => {
      const grid = generateCalendarGrid(2025, 1);
      const prevMonthCell = grid.cells.find((c) => !c.isCurrentMonth && c.date.getMonth() === 0);
      const nextMonthCell = grid.cells.find((c) => !c.isCurrentMonth && c.date.getMonth() === 2);
      expect(prevMonthCell?.accessibleLabel).toContain('previous month');
      expect(nextMonthCell?.accessibleLabel).toContain('next month');
    });

    it('returns only complete weeks with no extra trailing week', () => {
      for (let month = 0; month < 12; month++) {
        const grid = generateCalendarGrid(2025, month);
        expect([28, 35, 42]).toContain(grid.cells.length);
        expect(grid.cells.length).toBe(grid.weeks.length * 7);
        expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
        // Last week must contain at least one current-month day
        const lastWeek = grid.weeks[grid.weeks.length - 1];
        expect(lastWeek.some((c) => c.isCurrentMonth)).toBe(true);
      }
    });

    it('does not render a 6th week for February 2025 (fits in 5 weeks)', () => {
      const grid = generateCalendarGrid(2025, 1);
      expect(grid.cells).toHaveLength(35);
      expect(grid.weeks).toHaveLength(5);
    });
  });

  describe('parseISODate', () => {
    it('parses valid ISO date strings', () => {
      expect(parseISODate('2025-01-15')).toEqual(new Date(2025, 0, 15));
      expect(parseISODate('2024-02-29')).toEqual(new Date(2024, 1, 29));
      expect(parseISODate('2025-12-31')).toEqual(new Date(2025, 11, 31));
    });

    it('returns null for invalid date strings', () => {
      expect(parseISODate('')).toBeNull();
      expect(parseISODate('2025-13-01')).toBeNull();
      expect(parseISODate('2025-02-30')).toBeNull();
      expect(parseISODate('2025-01-32')).toBeNull();
      expect(parseISODate('invalid')).toBeNull();
      expect(parseISODate('2025/01/15')).toBeNull();
    });
  });

  describe('isValidDate', () => {
    it('returns true for valid dates', () => {
      expect(isValidDate('2025-01-15')).toBe(true);
      expect(isValidDate('2024-02-29')).toBe(true);
    });

    it('returns false for invalid dates', () => {
      expect(isValidDate('')).toBe(false);
      expect(isValidDate('2025-02-30')).toBe(false);
      expect(isValidDate('2025-13-01')).toBe(false);
    });
  });

  describe('formatISODate', () => {
    it('formats date as YYYY-MM-DD', () => {
      expect(formatISODate(new Date(2025, 0, 1))).toBe('2025-01-01');
      expect(formatISODate(new Date(2025, 11, 31))).toBe('2025-12-31');
      expect(formatISODate(new Date(2025, 5, 15))).toBe('2025-06-15');
    });
  });

  describe('navigateMonth', () => {
    it('navigates to previous month', () => {
      expect(navigateMonth(2025, 0, 'prev')).toEqual({ year: 2024, month: 11 });
      expect(navigateMonth(2025, 5, 'prev')).toEqual({ year: 2025, month: 4 });
    });

    it('navigates to next month', () => {
      expect(navigateMonth(2025, 10, 'next')).toEqual({ year: 2025, month: 11 });
      expect(navigateMonth(2025, 11, 'next')).toEqual({ year: 2026, month: 0 });
    });
  });

  describe('getWeekdays', () => {
    it('returns Monday through Sunday', () => {
      expect(getWeekdays()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });
  });

  describe('getMonthName', () => {
    it('returns correct month name', () => {
      expect(getMonthName(0)).toBe('January');
      expect(getMonthName(11)).toBe('December');
    });
  });

  describe('timezones', () => {
    // 21:00 Sunday in New York = 03:00 Monday UTC = Monday afternoon Auckland.
    const instant = Date.parse('2025-01-20T01:00:00+00:00');

    it('places the same instant on different days per zone', () => {
      expect(toZonedDateString(instant, 'America/New_York')).toBe('2025-01-19');
      expect(toZonedDateString(instant, 'UTC')).toBe('2025-01-20');
      expect(toZonedDateString(instant, 'Pacific/Auckland')).toBe('2025-01-20');
    });

    it('validates IANA zones', () => {
      expect(isValidTimezone('Europe/Madrid')).toBe(true);
      expect(isValidTimezone('Not/AZone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });

    it('resolves the system zone', () => {
      expect(getSystemTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it('ships a curated non-empty option list', () => {
      expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(20);
      expect(TIMEZONE_OPTIONS.every((o) => isValidTimezone(o.value))).toBe(true);
    });
  });
});