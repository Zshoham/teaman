import { describe, it, expect, vi } from 'vitest';

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

import { getCollection } from 'astro:content';
import { chapterHref, loadGuides } from '../guides';
import type { Guide } from '../guides';

// ── chapterHref ───────────────────────────────────────────────────────────────

const sampleGuide: Guide = {
  slug: 'my-guide',
  title: 'My Guide',
  chapters: [
    { slug: 'intro', entryId: 'my-guide/intro', title: 'Introduction' },
    { slug: 'chapter-2', entryId: 'my-guide/chapter-2', title: 'Chapter Two' },
  ],
};

describe('chapterHref', () => {
  it('returns the guide root URL for the first chapter', () => {
    expect(chapterHref(sampleGuide, 'intro')).toBe('/guides/my-guide/');
  });

  it('returns a chapter-level URL for subsequent chapters', () => {
    expect(chapterHref(sampleGuide, 'chapter-2')).toBe('/guides/my-guide/chapter-2/');
  });

  it('treats any slug as non-first when chapters is empty', () => {
    const empty: Guide = { ...sampleGuide, chapters: [] };
    expect(chapterHref(empty, 'intro')).toBe('/guides/my-guide/intro/');
  });
});

// ── loadGuides ────────────────────────────────────────────────────────────────

describe('loadGuides', () => {
  // The two collections a guide page reads: the guides' indexes and chapters.
  function collections(indexes: object[], chapterIds: string[]) {
    vi.mocked(getCollection).mockImplementation((async (name: string) => (name === 'guideIndexes'
      ? indexes
      : chapterIds.map(id => ({ id, collection: 'guides', data: {}, body: `body of ${id}` })))) as any);
  }

  const index = {
    id: 'g',
    collection: 'guideIndexes',
    filePath: 'vault/guides/g/SUMMARY.md',
    body: '# G\n',
    data: {
      title: 'G',
      tags: ['a'],
      chapters: [{ slug: 'index', entryId: 'g', title: 'Intro' }, { slug: 'next', entryId: 'g/next', title: 'Next' }],
    },
  };

  it('joins each chapter to its collection entry, with the SUMMARY alongside', async () => {
    collections([index], ['g', 'g/next', 'other/chapter']);
    const [guide] = await loadGuides();
    expect(guide.slug).toBe('g');
    expect(guide.title).toBe('G');
    expect(guide.chapters.map(chapter => [chapter.slug, chapter.entry.id])).toEqual([['index', 'g'], ['next', 'g/next']]);
    expect(guide.summary).toEqual({ tags: ['a'], body: '# G\n', sourcePath: expect.stringMatching(/vault\/guides\/g\/SUMMARY\.md$/) });
  });

  it('fails when the collection does not publish a chapter the index lists', async () => {
    collections([index], ['g']);
    await expect(loadGuides()).rejects.toThrow('g/next is not in the published guides collection');
  });
});
