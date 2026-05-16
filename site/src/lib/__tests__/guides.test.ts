import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

import { getCollection } from 'astro:content';
import {
  guideSlugFromSummaryId,
  chapterHref,
  parseGuide,
  listGuides,
} from '../guides';
import type { Guide } from '../guides';

// ── guideSlugFromSummaryId ────────────────────────────────────────────────────

describe('guideSlugFromSummaryId', () => {
  it('removes a trailing /summary segment (lowercase)', () => {
    expect(guideSlugFromSummaryId('my-guide/summary')).toBe('my-guide');
  });

  it('removes a trailing /SUMMARY segment (uppercase)', () => {
    expect(guideSlugFromSummaryId('my-guide/SUMMARY')).toBe('my-guide');
  });

  it('removes a trailing /Summary segment (mixed case)', () => {
    expect(guideSlugFromSummaryId('my-guide/Summary')).toBe('my-guide');
  });

  it('handles nested slugs', () => {
    expect(guideSlugFromSummaryId('section/guide/summary')).toBe('section/guide');
  });

  it('leaves strings without /summary unchanged', () => {
    expect(guideSlugFromSummaryId('just-a-slug')).toBe('just-a-slug');
  });
});

// ── chapterHref ───────────────────────────────────────────────────────────────

const sampleGuide: Guide = {
  slug: 'my-guide',
  title: 'My Guide',
  chapters: [
    { slug: 'intro', title: 'Introduction' },
    { slug: 'chapter-2', title: 'Chapter Two' },
  ],
  dir: '/content/guides/my-guide',
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

// ── parseGuide ────────────────────────────────────────────────────────────────

describe('parseGuide', () => {
  it('parses title from H1 and chapters from a bullet list', () => {
    const summary = `# The Guide Title

- [Introduction](intro.md)
- [Chapter Two](chapter-two.md)
`;
    const guide = parseGuide('the-guide', summary);
    expect(guide.title).toBe('The Guide Title');
    expect(guide.slug).toBe('the-guide');
    expect(guide.chapters).toEqual([
      { slug: 'intro', title: 'Introduction' },
      { slug: 'chapter-two', title: 'Chapter Two' },
    ]);
  });

  it('falls back to slug-derived title when no H1 is present', () => {
    const guide = parseGuide('my-guide', '- [Intro](intro.md)\n');
    expect(guide.title).toBe('my guide'); // hyphens → spaces
  });

  it('accepts * list markers', () => {
    const guide = parseGuide('g', '# G\n* [Ch](ch.md)\n');
    expect(guide.chapters).toHaveLength(1);
    expect(guide.chapters[0].slug).toBe('ch');
  });

  it('accepts indented list items', () => {
    const guide = parseGuide('g', '# G\n  - [Ch](ch.md)\n');
    expect(guide.chapters).toHaveLength(1);
  });

  it('strips the ./ prefix from chapter links', () => {
    const guide = parseGuide('g', '# G\n- [Ch](./ch.md)\n');
    expect(guide.chapters[0].slug).toBe('ch');
  });

  it('strips a leading / from chapter links', () => {
    const guide = parseGuide('g', '# G\n- [Ch](/ch.md)\n');
    expect(guide.chapters[0].slug).toBe('ch');
  });

  it('handles Windows-style line endings', () => {
    const summary = '# Guide\r\n- [Intro](intro.md)\r\n';
    const guide = parseGuide('guide', summary);
    expect(guide.title).toBe('Guide');
    expect(guide.chapters).toHaveLength(1);
  });

  it('returns an empty chapters array for a summary with only a title', () => {
    const guide = parseGuide('g', '# Title\n');
    expect(guide.chapters).toEqual([]);
  });
});

// ── listGuides ────────────────────────────────────────────────────────────────

describe('listGuides', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
  });

  it('parses and returns guides sorted by slug', async () => {
    vi.mocked(getCollection).mockResolvedValue([
      { id: 'zebra/summary', body: '# Zebra Guide\n- [Ch](ch.md)\n' },
      { id: 'alpha/summary', body: '# Alpha Guide\n- [Ch](ch.md)\n' },
    ] as any);

    const guides = await listGuides();
    expect(guides.map(g => g.slug)).toEqual(['alpha', 'zebra']);
  });

  it('returns an empty array when no summaries exist', async () => {
    vi.mocked(getCollection).mockResolvedValue([] as any);
    expect(await listGuides()).toEqual([]);
  });
});
