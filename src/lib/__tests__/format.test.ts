import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fmtDate, fmtDayRange, fmtLongDay, fmtWeeksAgo, relTime, weeksAgo } from '../format';

describe('fmtDate', () => {
  it('formats a Date object with leading-zero day', () => {
    expect(fmtDate(new Date(2026, 0, 5, 12))).toBe('05 jan 2026');
  });

  it('formats mid-year dates', () => {
    expect(fmtDate(new Date(2026, 6, 20, 12))).toBe('20 jul 2026');
  });

  it('formats end-of-year dates', () => {
    expect(fmtDate(new Date(2025, 11, 31, 12))).toBe('31 dec 2025');
  });

  it('accepts an ISO string', () => {
    // Use a UTC noon time so getDate() returns the right day in any timezone
    const date = new Date(2026, 2, 15, 12);
    expect(fmtDate(date.toISOString())).toBe('15 mar 2026');
  });
});

// Freeze time so relTime comparisons are deterministic.
const NOW = new Date(2026, 4, 15, 12, 0, 0).getTime(); // May 15 2026 noon local

describe('relTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for < 24 hours ago', () => {
    expect(relTime(new Date(NOW - 6 * 3_600_000))).toBe('today');
  });

  it('returns "yesterday" for 24–48 hours ago', () => {
    expect(relTime(new Date(NOW - 1.5 * 86_400_000))).toBe('yesterday');
  });

  it('returns "Xd ago" for 2–13 days ago', () => {
    expect(relTime(new Date(NOW - 5 * 86_400_000))).toBe('5d ago');
    expect(relTime(new Date(NOW - 13 * 86_400_000))).toBe('13d ago');
  });

  it('returns "Xw ago" for 14–59 days ago', () => {
    expect(relTime(new Date(NOW - 28 * 86_400_000))).toBe('4w ago');
    expect(relTime(new Date(NOW - 14 * 86_400_000))).toBe('2w ago');
  });

  it('returns "Xmo ago" for 60–364 days ago', () => {
    expect(relTime(new Date(NOW - 90 * 86_400_000))).toBe('3mo ago');
    expect(relTime(new Date(NOW - 60 * 86_400_000))).toBe('2mo ago');
  });

  it('returns "Xy ago" for 365+ days', () => {
    expect(relTime(new Date(NOW - 730 * 86_400_000))).toBe('2y ago');
    expect(relTime(new Date(NOW - 365 * 86_400_000))).toBe('1y ago');
  });

  it('accepts a string input', () => {
    const d = new Date(NOW - 3 * 86_400_000);
    expect(relTime(d.toISOString())).toBe('3d ago');
  });
});

describe('fmtLongDay', () => {
  it('formats a Date as lowercase "month day"', () => {
    expect(fmtLongDay(new Date(2026, 4, 4, 12))).toBe('may 4');
  });

  it('formats an ISO date string without timezone drift', () => {
    expect(fmtLongDay('2026-05-04')).toBe('may 4');
  });

  it('does not zero-pad the day', () => {
    expect(fmtLongDay('2026-01-09')).toBe('january 9');
  });
});

describe('fmtDayRange', () => {
  it('collapses same-month ranges to a single month label', () => {
    expect(fmtDayRange('2026-05-03', '2026-05-09')).toBe('may 3 — 9');
  });

  it('shows both month labels when the range spans months', () => {
    expect(fmtDayRange('2026-04-26', '2026-05-02')).toBe('apr 26 — may 2');
  });

  it('uses long month names with {month: "long"}', () => {
    expect(fmtDayRange('2026-05-03', '2026-05-09', { month: 'long' })).toBe('may 3 — 9');
  });

  it('appends the end-date year with {year: true}', () => {
    expect(fmtDayRange('2026-05-03', '2026-05-09', { year: true })).toBe('may 3 — 9, 2026');
  });

  it('appends year for cross-month ranges too', () => {
    expect(fmtDayRange('2025-12-28', '2026-01-03', { year: true })).toBe('dec 28 — jan 3, 2026');
  });
});

describe('weeksAgo', () => {
  // Today: Friday, May 15 2026. Sunday-of-today: May 10 2026.
  const NOW = new Date(2026, 4, 15, 12, 0, 0);

  it('returns 0 for the week containing today', () => {
    expect(weeksAgo('2026-05-10', NOW)).toBe(0);
  });

  it('returns 1 for the previous Sunday-anchored week', () => {
    expect(weeksAgo('2026-05-03', NOW)).toBe(1);
  });

  it('counts further past weeks correctly', () => {
    expect(weeksAgo('2026-04-26', NOW)).toBe(2);
    expect(weeksAgo('2026-02-22', NOW)).toBe(11);
  });

  it('returns negative integers for future weeks', () => {
    expect(weeksAgo('2026-05-17', NOW)).toBe(-1);
  });

  it('snaps mid-week target dates to their Sunday bucket', () => {
    // May 7 2026 is a Thursday — still belongs to week starting May 3.
    expect(weeksAgo('2026-05-07', NOW)).toBe(1);
  });
});

describe('fmtWeeksAgo', () => {
  const NOW = new Date(2026, 4, 15, 12, 0, 0); // Fri May 15 2026

  it('returns "now" for the current week', () => {
    expect(fmtWeeksAgo('2026-05-10', NOW)).toBe('now');
  });

  it('returns "Nw" for past weeks', () => {
    expect(fmtWeeksAgo('2026-05-03', NOW)).toBe('1w');
    expect(fmtWeeksAgo('2026-02-22', NOW)).toBe('11w');
  });

  it('returns "+Nw" for future weeks', () => {
    expect(fmtWeeksAgo('2026-05-17', NOW)).toBe('+1w');
  });
});
