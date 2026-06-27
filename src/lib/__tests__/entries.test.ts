import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock virtual modules before any imports from the modules under test.
vi.mock('astro:content', () => ({ getCollection: vi.fn() }));
vi.mock('fs/promises', () => ({ stat: vi.fn() }));

import { getCollection } from 'astro:content';
import {
  isoDate,
  loadDailyNoteEntries,
  loadNoteEntries,
} from '../entries';
import { extractExcerpt, readingTimeMeta, wordCount, wordMeta } from '../text';

// ── Pure utilities ────────────────────────────────────────────────────────────

describe('wordMeta', () => {
  it('formats small word counts', () => {
    expect(wordMeta(0)).toBe('0 words');
    expect(wordMeta(42)).toBe('42 words');
  });

  it('uses locale-formatted numbers', () => {
    expect(wordMeta(1234)).toBe(`${(1234).toLocaleString()} words`);
  });
});

describe('readingTimeMeta', () => {
  it('returns at least 1 min read for very short texts', () => {
    expect(readingTimeMeta(0)).toBe('1 min read');
    expect(readingTimeMeta(219)).toBe('1 min read');
  });

  it('returns 1 min read for exactly 220 words', () => {
    expect(readingTimeMeta(220)).toBe('1 min read');
  });

  it('rounds up past the 220 wpm boundary', () => {
    expect(readingTimeMeta(221)).toBe('2 min read');
    expect(readingTimeMeta(440)).toBe('2 min read');
    expect(readingTimeMeta(441)).toBe('3 min read');
  });
});

describe('isoDate', () => {
  it('produces a YYYY-MM-DD UTC string', () => {
    expect(isoDate(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
    expect(isoDate(new Date('2026-12-31T12:00:00Z'))).toBe('2026-12-31');
  });
});

describe('wordCount', () => {
  it('returns 0 for empty or whitespace-only strings', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });

  it('counts space-separated words', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  it('ignores leading, trailing, and multiple spaces', () => {
    expect(wordCount('  hello   world  ')).toBe(2);
  });

  it('handles newlines as word separators', () => {
    expect(wordCount('line one\nline two')).toBe(4);
  });
});

describe('extractExcerpt', () => {
  it('returns the first non-empty paragraph', () => {
    const body = '\n\nFirst paragraph content.\n\nSecond paragraph.';
    expect(extractExcerpt(body)).toBe('First paragraph content.');
  });

  it('strips headings', () => {
    const body = '## Heading\n\nParagraph text.';
    expect(extractExcerpt(body)).toBe('Paragraph text.');
  });

  it('strips fenced code blocks', () => {
    const body = '```js\nconst x = 1;\n```\n\nAfter code.';
    expect(extractExcerpt(body)).toBe('After code.');
  });

  it('strips list item markers', () => {
    const body = '- item one\n- item two';
    expect(extractExcerpt(body)).toBe('item one\nitem two');
  });

  it('resolves wiki links without alias to their page name', () => {
    expect(extractExcerpt('See [[My Note]] for details.')).toBe('See My Note for details.');
  });

  it('resolves wiki links with alias to their alias', () => {
    expect(extractExcerpt('See [[My Note|the note]] here.')).toBe('See the note here.');
  });

  it('resolves markdown links to their display text', () => {
    expect(extractExcerpt('[click here](https://example.com)')).toBe('click here');
  });

  it('strips inline bold and backtick markers', () => {
    expect(extractExcerpt('This is **bold** and `code`.')).toBe('This is bold and code.');
  });

  it('truncates long paragraphs at a word boundary', () => {
    const longWord = 'word';
    const words = Array.from({ length: 60 }, (_, i) => `${longWord}${i}`);
    const body = words.join(' '); // well over 220 chars
    const result = extractExcerpt(body);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(221); // 220 chars + ellipsis
    expect(result.slice(0, -1)).not.toMatch(/\s$/); // no trailing space before ellipsis
  });

  it('returns empty string for a body with only markdown syntax', () => {
    expect(extractExcerpt('## Heading\n\n```js\ncode\n```')).toBe('');
  });
});

// ── Async entry loaders ───────────────────────────────────────────────────────

describe('loadNoteEntries', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
  });

  it('maps collection entries to Entry objects', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      {
        id: 'my-note',
        data: { title: 'My Note', tags: ['test'], date: new Date('2026-01-15T00:00:00Z') },
        body: 'This is the note body with some words.',
      },
    ] as any);

    const entries = await loadNoteEntries();
    expect(entries).toHaveLength(1);
    const [e] = entries;
    expect(e.id).toBe('note-my-note');
    expect(e.type).toBe('note');
    expect(e.title).toBe('My Note');
    expect(e.tags).toEqual(['test']);
    expect(e.updated).toBe('2026-01-15');
    expect(e.created).toBe('2026-01-15');
    expect(e.href).toBe('/notes/my-note/');
    expect(e.meta).toMatch(/\d+ words/);
  });

  it('filters out draft notes', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: 'draft', data: { draft: true, date: new Date() }, body: '' },
      { id: 'live', data: { draft: false, date: new Date('2026-01-15T00:00:00Z') }, body: 'Content.' },
    ] as any);

    const entries = await loadNoteEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('note-live');
  });

  it('falls back to the note id when title is absent', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: 'untitled-note', data: { date: new Date('2026-01-15T00:00:00Z') }, body: 'Body.' },
    ] as any);

    const [entry] = await loadNoteEntries();
    expect(entry.title).toBe('untitled-note');
  });

  it('returns an empty array when the collection is empty', async () => {
    vi.mocked(getCollection).mockResolvedValue([] as any);
    expect(await loadNoteEntries()).toEqual([]);
  });
});

describe('loadDailyNoteEntries', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
  });

  it('builds daily index entries from the authored date id', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      {
        id: '2026-05-04',
        data: { date: new Date('2026-05-04T00:00:00.000Z'), tags: ['focus'] },
        body: 'Daily note body.',
      },
    ] as any);

    const entries = await loadDailyNoteEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'daily-2026-05-04',
      title: 'Monday, may 4',
      updated: '2026-05-04',
      created: '2026-05-04',
      href: '/daily/2026-05-03/#day-2026-05-04',
    });
  });
});
