/** Formats a year span for display: "2011" or "2011-2019".
 *  A range only renders when the end year is a valid year strictly after the
 *  start; identical, missing, malformed or reversed ends collapse to the start. */
export function formatYearRange(start?: string | null, end?: string | null): string {
  const from = (start ?? '').trim();
  const to = (end ?? '').trim();
  if (!/^\d{4}$/.test(from)) return from;
  if (!/^\d{4}$/.test(to) || to <= from) return from;
  return `${from}-${to}`;
}
