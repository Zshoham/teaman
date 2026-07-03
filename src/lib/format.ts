export function fmtDate(input: Date | string): string {
  const d = toDate(input);
  const m = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return `${String(d.getDate()).padStart(2, '0')} ${m} ${d.getFullYear()}`;
}

export function relTime(input: Date | string): string {
  const d = toDate(input);
  const diffDays = (Date.now() - d.getTime()) / 86400000;
  if (diffDays < 1) return 'today';
  if (diffDays < 2) return 'yesterday';
  if (diffDays < 14) return `${Math.floor(diffDays)}d ago`;
  if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/** "may 4" — lowercase month name + day, no year. */
export function fmtLongDay(input: Date | string): string {
  const d = toDate(input);
  const m = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return `${m} ${d.getDate()}`;
}

export interface DayRangeOpts {
  /** `'short'` → "may 3 — 9", `'long'` → "may 3 — 9". Defaults to `'short'`. */
  month?: 'long' | 'short';
  /** Append ", YYYY" using the end-date's year. Defaults to `false`. */
  year?: boolean;
}

/**
 * Formats a date range like "may 3 — 9" or, if months differ, "apr 26 — may 2".
 * Pass `{ year: true }` to append the year ("may 3 — 9, 2026").
 */
export function fmtDayRange(
  start: Date | string,
  end: Date | string,
  opts: DayRangeOpts = {},
): string {
  const s = toDate(start);
  const e = toDate(end);
  const fmt: 'long' | 'short' = opts.month ?? 'short';
  const sm = s.toLocaleString('en-US', { month: fmt }).toLowerCase();
  const em = e.toLocaleString('en-US', { month: fmt }).toLowerCase();
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const core = sameMonth
    ? `${sm} ${s.getDate()} — ${e.getDate()}`
    : `${sm} ${s.getDate()} — ${em} ${e.getDate()}`;
  return opts.year ? `${core}, ${e.getFullYear()}` : core;
}

/**
 * Calendar-weeks between the (Sunday-anchored) week containing `weekStart`
 * and the week containing `now`. Positive for past weeks, 0 for the current
 * week, negative for future weeks.
 */
export function weeksAgo(weekStart: Date | string, now: Date = new Date()): number {
  const target = sundayOfLocal(toDate(weekStart));
  const today = sundayOfLocal(now);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  return Math.round(diffDays / 7);
}

/** "now" for the current week, "Nw" for past weeks, "+Nw" for future weeks. */
export function fmtWeeksAgo(weekStart: Date | string, now?: Date): string {
  const n = weeksAgo(weekStart, now);
  if (n === 0) return 'now';
  if (n < 0) return `+${-n}w`;
  return `${n}w`;
}

function sundayOfLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

/** UTC ISO date string (YYYY-MM-DD). Use for collection entries whose dates are UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDate(input: Date | string): Date {
  if (input instanceof Date) return input;
  // Bare ISO dates ("YYYY-MM-DD") parse as UTC midnight, which can render as
  // the previous day in negative-offset timezones. Force local-midnight so
  // these formatters always show the date the author wrote.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00`);
  return new Date(input);
}
