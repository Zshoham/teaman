import { describe, it, expect } from 'vitest';

import { buildFilterTabs, buildTopics, footerSummary } from '../collection-index';
import type { Entry, EntryType } from '../entries';

function entry(overrides: Partial<Entry> & { type: EntryType }): Entry {
  return {
    id: `${overrides.type}-${overrides.title ?? 'x'}`,
    title: 'x',
    excerpt: '',
    tags: [],
    updated: '2026-01-01',
    created: '2026-01-01',
    meta: '',
    href: '/',
    ...overrides,
  };
}

describe('buildFilterTabs', () => {
  it('lists an all tab plus every present type, in canonical order', () => {
    const tabs = buildFilterTabs([
      entry({ type: 'decision' }),
      entry({ type: 'note', title: 'a' }),
      entry({ type: 'note', title: 'b' }),
      entry({ type: 'slides' }),
    ]);
    expect(tabs).toEqual([
      { id: 'all', label: 'all', count: 4 },
      { id: 'note', label: 'notes', count: 2 },
      { id: 'slides', label: 'slides', count: 1 },
      { id: 'decision', label: 'decisions', count: 1 },
    ]);
  });

  it('omits types the vault has none of', () => {
    const tabs = buildFilterTabs([entry({ type: 'note' }), entry({ type: 'guide' })]);
    expect(tabs.map(t => t.id)).toEqual(['all', 'note', 'guide']);
  });

  it('drops the per-type tabs when the list holds a single type', () => {
    const tabs = buildFilterTabs([entry({ type: 'note', title: 'a' }), entry({ type: 'note', title: 'b' })]);
    expect(tabs).toEqual([{ id: 'all', label: 'all', count: 2 }]);
  });

  it('returns just an empty all tab for no entries', () => {
    expect(buildFilterTabs([])).toEqual([{ id: 'all', label: 'all', count: 0 }]);
  });
});

describe('buildTopics', () => {
  it('counts tags, most used first then alphabetical', () => {
    const topics = buildTopics([
      entry({ type: 'note', title: 'a', tags: ['rust', 'wasm'] }),
      entry({ type: 'note', title: 'b', tags: ['rust'] }),
      entry({ type: 'guide', tags: ['astro'] }),
    ]);
    expect(topics).toEqual([
      { tag: 'rust', count: 2 },
      { tag: 'astro', count: 1 },
      { tag: 'wasm', count: 1 },
    ]);
  });

  it('is empty when nothing is tagged', () => {
    expect(buildTopics([entry({ type: 'guide' })])).toEqual([]);
  });
});

describe('footerSummary', () => {
  it('pluralises the noun and reports the newest update', () => {
    const summary = footerSummary([
      entry({ type: 'note', title: 'a', updated: '2026-03-04' }),
      entry({ type: 'note', title: 'b', updated: '2026-01-09' }),
    ]);
    expect(summary).toMatch(/^2 entries · last edit /);
  });

  it('uses the singular noun for one entry', () => {
    expect(footerSummary([entry({ type: 'note' })], 'note', 'notes')).toMatch(/^1 note · /);
  });

  it('takes the latest date even when entries are out of order', () => {
    const late = footerSummary([
      entry({ type: 'note', title: 'a', updated: '2026-01-09' }),
      entry({ type: 'note', title: 'b', updated: '2026-03-04' }),
    ]);
    expect(late).toBe(footerSummary([
      entry({ type: 'note', title: 'b', updated: '2026-03-04' }),
      entry({ type: 'note', title: 'a', updated: '2026-01-09' }),
    ]));
  });

  it('drops the last-edit clause for an empty collection', () => {
    expect(footerSummary([], 'note', 'notes')).toBe('0 notes');
  });
});
