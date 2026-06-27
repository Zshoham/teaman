import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

import { getCollection } from 'astro:content';
import {
  addDays,
  dayAnchor,
  groupByWeek,
  isoDate,
  loadDailyEntries,
  loadDailyWeeks,
  sundayOf,
  WEEKDAY_INITIALS,
  WEEKDAY_LONG,
  weekHref,
  type DailyEntry,
} from '../dailies';

// ── Pure utilities ───────────────────────────────────────────────────────────

describe('isoDate', () => {
  it('formats a local Date as YYYY-MM-DD without timezone drift', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('zero-pads single-digit months and days', () => {
    expect(isoDate(new Date(2026, 2, 7))).toBe('2026-03-07');
  });
});

describe('sundayOf', () => {
  it('returns the same date when already Sunday', () => {
    // May 3 2026 is a Sunday.
    expect(isoDate(sundayOf(new Date(2026, 4, 3)))).toBe('2026-05-03');
  });

  it('walks back to Sunday across weekdays', () => {
    // May 6 2026 is a Wednesday.
    expect(isoDate(sundayOf(new Date(2026, 4, 6)))).toBe('2026-05-03');
    // May 9 2026 is a Saturday.
    expect(isoDate(sundayOf(new Date(2026, 4, 9)))).toBe('2026-05-03');
  });

  it('crosses month boundaries cleanly', () => {
    // May 1 2026 is a Friday; the prior Sunday is April 26.
    expect(isoDate(sundayOf(new Date(2026, 4, 1)))).toBe('2026-04-26');
  });
});

describe('addDays', () => {
  it('adds positive day counts', () => {
    expect(isoDate(addDays(new Date(2026, 4, 3), 6))).toBe('2026-05-09');
  });

  it('handles negative day counts', () => {
    expect(isoDate(addDays(new Date(2026, 4, 3), -3))).toBe('2026-04-30');
  });
});

describe('WEEKDAY_INITIALS', () => {
  it('starts on Sunday', () => {
    expect(WEEKDAY_INITIALS).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});

describe('WEEKDAY_LONG', () => {
  it('maps short weekdays to long names', () => {
    expect(WEEKDAY_LONG.Sun).toBe('Sunday');
    expect(WEEKDAY_LONG.Wed).toBe('Wednesday');
  });
});

describe('dayAnchor', () => {
  it('prefixes the date with `day-`', () => {
    expect(dayAnchor('2026-05-04')).toBe('day-2026-05-04');
  });
});

describe('weekHref', () => {
  it('uses the week id under /daily/', () => {
    expect(weekHref({ id: '2026-05-03' })).toBe('/daily/2026-05-03/');
  });
});

// ── Grouping ─────────────────────────────────────────────────────────────────

function entry(date: string, weekday: DailyEntry['weekday'], words = 1): DailyEntry {
  // The grouping/formatting code only ever reads date/weekday/tags/words, so
  // a stub `entry` object is fine in tests that don't invoke `render()`.
  return { date, weekday, tags: [], words, entry: {} as DailyEntry['entry'] };
}

describe('groupByWeek', () => {
  it('groups consecutive Mon–Sun days into two Sunday-anchored weeks', () => {
    // May 3 (Sun) | May 4-9 (Mon-Sat) belong to week 2026-05-03.
    // May 10 (Sun) starts the next Sunday-anchored week.
    const weeks = groupByWeek([
      entry('2026-05-03', 'Sun'),
      entry('2026-05-04', 'Mon'),
      entry('2026-05-09', 'Sat'),
      entry('2026-05-10', 'Sun'),
    ]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ id: '2026-05-10', start: '2026-05-10', end: '2026-05-16' });
    expect(weeks[1]).toMatchObject({ id: '2026-05-03', start: '2026-05-03', end: '2026-05-09' });
    expect(weeks[1].days.map(d => d.date)).toEqual(['2026-05-03', '2026-05-04', '2026-05-09']);
  });

  it('sorts weeks newest-first', () => {
    const weeks = groupByWeek([
      entry('2026-02-22', 'Sun'),
      entry('2026-05-04', 'Mon'),
      entry('2026-03-29', 'Sun'),
    ]);
    expect(weeks.map(w => w.id)).toEqual(['2026-05-03', '2026-03-29', '2026-02-22']);
  });

  it('sums word counts across days as totalWords', () => {
    const weeks = groupByWeek([
      entry('2026-05-04', 'Mon', 12),
      entry('2026-05-05', 'Tue', 8),
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalWords).toBe(20);
  });

  it('orders days within a week chronologically', () => {
    const weeks = groupByWeek([
      entry('2026-05-08', 'Fri'),
      entry('2026-05-04', 'Mon'),
      entry('2026-05-06', 'Wed'),
    ]);
    expect(weeks[0].days.map(d => d.date)).toEqual(['2026-05-04', '2026-05-06', '2026-05-08']);
  });

  it('returns an empty list for no entries', () => {
    expect(groupByWeek([])).toEqual([]);
  });
});

// ── Async loaders ────────────────────────────────────────────────────────────

describe('loadDailyEntries', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
  });

  it('derives weekday/words/tags and preserves the source entry', async () => {
    // May 4 2026 is a Monday.
    const collected = {
      id: '2026-05-04',
      data: { date: new Date(2026, 4, 4), tags: ['focus'] },
      body: 'First paragraph here.\n\nSecond one.',
    };
    vi.mocked(getCollection).mockResolvedValue([collected] as any);

    const entries = await loadDailyEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      date: '2026-05-04',
      weekday: 'Mon',
      tags: ['focus'],
      words: 5,
    });
    expect(entries[0].entry).toBe(collected);
  });

  it('preserves the authored date from the collection id', async () => {
    const collected = {
      id: '2026-05-04',
      data: { date: new Date('2026-05-04T00:00:00.000Z') },
      body: 'timezone drift check',
    };
    vi.mocked(getCollection).mockResolvedValue([collected] as any);

    const entries = await loadDailyEntries();
    expect(entries[0]).toMatchObject({
      date: '2026-05-04',
      weekday: 'Mon',
    });
  });

  it('skips drafts', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: 'drafted', data: { date: new Date(2026, 4, 4), draft: true }, body: 'x' },
      { id: 'live', data: { date: new Date(2026, 4, 5) }, body: 'y' },
    ] as any);
    const entries = await loadDailyEntries();
    expect(entries.map(e => e.date)).toEqual(['2026-05-05']);
  });

  it('returns entries sorted by date ascending', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: 'b', data: { date: new Date(2026, 4, 8) }, body: 'b' },
      { id: 'a', data: { date: new Date(2026, 4, 4) }, body: 'a' },
      { id: 'c', data: { date: new Date(2026, 4, 10) }, body: 'c' },
    ] as any);
    const entries = await loadDailyEntries();
    expect(entries.map(e => e.date)).toEqual(['2026-05-04', '2026-05-08', '2026-05-10']);
  });

  it('defaults tags to an empty array', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: '2026-05-04', data: { date: new Date(2026, 4, 4) }, body: 'x' },
    ] as any);
    const [entry] = await loadDailyEntries();
    expect(entry.tags).toEqual([]);
  });
});

describe('loadDailyWeeks', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
  });

  it('loads + groups in one call', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: '2026-05-04', data: { date: new Date(2026, 4, 4) }, body: 'mon' },
      { id: '2026-05-05', data: { date: new Date(2026, 4, 5) }, body: 'tue' },
      { id: '2026-04-20', data: { date: new Date(2026, 3, 20) }, body: 'older' },
    ] as any);
    const weeks = await loadDailyWeeks();
    expect(weeks.map(w => w.id)).toEqual(['2026-05-03', '2026-04-19']);
    expect(weeks[0].days).toHaveLength(2);
  });
});
