import { describe, expect, it } from 'vitest';
import { formatYearRange } from '../years';

describe('formatYearRange', () => {
  it('collapses identical years into a single year', () => {
    expect(formatYearRange('2026', '2026')).toBe('2026');
    expect(formatYearRange('2011', '2011')).toBe('2011');
  });

  it('keeps a range when the end year is after the start year', () => {
    expect(formatYearRange('2011', '2019')).toBe('2011-2019');
    expect(formatYearRange('2024', '2026')).toBe('2024-2026');
  });

  it('ignores a missing, empty or malformed end year', () => {
    expect(formatYearRange('2011')).toBe('2011');
    expect(formatYearRange('2011', undefined)).toBe('2011');
    expect(formatYearRange('2011', null)).toBe('2011');
    expect(formatYearRange('2011', '')).toBe('2011');
    expect(formatYearRange('2011', 'unknown')).toBe('2011');
    expect(formatYearRange('2011', 'TBD')).toBe('2011');
  });

  it('returns a lone start year unchanged', () => {
    expect(formatYearRange('2026')).toBe('2026');
    expect(formatYearRange('2026', undefined)).toBe('2026');
    expect(formatYearRange('')).toBe('');
  });

  it('never renders a reversed range', () => {
    expect(formatYearRange('2019', '2011')).toBe('2019');
  });
});
