import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

import { getCollection } from 'astro:content';
import { isSectionActive, loadNavSections, type NavSection } from '../nav';

const mockGetCollection = vi.mocked(getCollection);

interface Fixture {
  notes?: { id: string; draft?: boolean }[];
  slides?: { id: string; draft?: boolean }[];
  /** Guide slugs; each becomes a `guideSummaries` entry with one chapter. */
  guides?: string[];
  /** ISO dates for daily notes. */
  dailies?: string[];
  decisions?: string[];
}

function stubCollections(fixture: Fixture) {
  mockGetCollection.mockImplementation(((name: string) => {
    switch (name) {
      case 'notes':
        return Promise.resolve(
          (fixture.notes ?? []).map(n => ({ id: n.id, data: { draft: n.draft ?? false } })),
        );
      case 'slides':
        return Promise.resolve(
          (fixture.slides ?? []).map(s => ({ id: s.id, data: { draft: s.draft ?? false } })),
        );
      case 'guideSummaries':
        return Promise.resolve(
          (fixture.guides ?? []).map(slug => ({
            id: `${slug}/summary`,
            body: `# ${slug}\n\n- [Intro](./intro.md)\n`,
          })),
        );
      case 'dailies':
        return Promise.resolve(
          (fixture.dailies ?? []).map(date => ({
            id: date,
            body: '',
            data: { date: new Date(`${date}T00:00:00`), draft: false },
          })),
        );
      case 'decisions':
        return Promise.resolve(
          (fixture.decisions ?? []).map(num => ({
            id: `${num}-thing`,
            body: '',
            data: { title: 'Thing', date: new Date('2026-01-01T00:00:00'), status: 'accepted' },
          })),
        );
      default:
        return Promise.resolve([]);
    }
  }) as unknown as typeof getCollection);
}

const ids = (sections: NavSection[]) => sections.map(s => s.id);

beforeEach(() => {
  mockGetCollection.mockReset();
});

describe('loadNavSections', () => {
  it('lists every section that has content, content sections first', async () => {
    stubCollections({
      notes: [{ id: 'a' }],
      slides: [{ id: 'deck' }],
      guides: ['rust'],
      dailies: ['2026-03-04'],
      decisions: ['0001'],
    });
    expect(ids(await loadNavSections())).toEqual([
      'notes',
      'guides',
      'slides',
      'daily',
      'decisions',
    ]);
  });

  it('omits sections with no content so no vault gets a dead link', async () => {
    stubCollections({ notes: [{ id: 'a' }] });
    expect(ids(await loadNavSections())).toEqual(['notes']);
  });

  it('ignores drafts when deciding whether a section exists', async () => {
    stubCollections({
      notes: [{ id: 'a', draft: true }],
      slides: [{ id: 'deck', draft: true }],
    });
    expect(ids(await loadNavSections())).toEqual([]);
  });

  it('ignores underscore-prefixed decks, which never publish', async () => {
    stubCollections({ slides: [{ id: '_wip/deck' }] });
    expect(ids(await loadNavSections())).toEqual([]);

    stubCollections({ slides: [{ id: 'nested/deck' }] });
    expect(ids(await loadNavSections())).toEqual(['slides']);
  });

  it('groups only the content sections into the mobile menu', async () => {
    stubCollections({
      notes: [{ id: 'a' }],
      guides: ['rust'],
      slides: [{ id: 'deck' }],
      dailies: ['2026-03-04'],
      decisions: ['0001'],
    });
    const sections = await loadNavSections();
    expect(ids(sections.filter(s => s.grouped))).toEqual(['notes', 'guides', 'slides']);
    expect(ids(sections.filter(s => !s.grouped))).toEqual(['daily', 'decisions']);
  });

  it('points daily at the newest week rather than the redirecting index', async () => {
    stubCollections({ dailies: ['2026-03-02', '2026-03-09'] });
    const daily = (await loadNavSections()).find(s => s.id === 'daily');
    expect(daily?.href).toMatch(/daily\/\d{4}-\d{2}-\d{2}\/$/);
    expect(daily?.dir).toMatch(/daily\/$/);
  });

  it('sends the content sections at their index pages', async () => {
    stubCollections({ notes: [{ id: 'a' }], guides: ['rust'], slides: [{ id: 'deck' }] });
    const sections = await loadNavSections();
    expect(sections.map(s => s.href)).toEqual([
      expect.stringMatching(/notes\/$/),
      expect.stringMatching(/guides\/$/),
      expect.stringMatching(/slides\/$/),
    ]);
  });
});

describe('isSectionActive', () => {
  const section: NavSection = {
    id: 'notes',
    label: 'notes',
    href: '/notes/',
    dir: '/notes/',
    grouped: true,
  };

  it('marks the index and anything under it active', () => {
    expect(isSectionActive(section, '/notes/')).toBe(true);
    expect(isSectionActive(section, '/notes/some-note/')).toBe(true);
  });

  it('leaves other sections alone', () => {
    expect(isSectionActive(section, '/')).toBe(false);
    expect(isSectionActive(section, '/guides/rust/')).toBe(false);
  });
});
