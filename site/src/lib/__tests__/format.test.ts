import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fmtDate, relTime } from '../format';

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
