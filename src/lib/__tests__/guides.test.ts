import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  guideSlugFromSummaryId,
  chapterHref,
  guideTitle,
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
    { slug: 'intro', entryId: 'my-guide/intro', title: 'Introduction' },
    { slug: 'chapter-2', entryId: 'my-guide/chapter-2', title: 'Chapter Two' },
  ],
  problems: [],
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

// ── guideTitle ────────────────────────────────────────────────────────────────

describe('guideTitle', () => {
  it('takes the H1 of the summary, else the slug with hyphens as spaces', () => {
    expect(guideTitle('the-guide', '# The Guide Title\n\n- [Intro](intro.md)\n')).toBe('The Guide Title');
    expect(guideTitle('my-guide', '- [Intro](intro.md)\n')).toBe('my guide');
    expect(guideTitle('guide', '# Guide\r\n- [Intro](intro.md)\r\n')).toBe('Guide');
  });
});

// ── listGuides ────────────────────────────────────────────────────────────────

describe('listGuides', () => {
  let vault: string | undefined;
  afterEach(() => {
    if (vault) rmSync(vault, { recursive: true, force: true });
    vault = undefined;
  });

  function write(files: Record<string, string>) {
    vault = mkdtempSync(join(tmpdir(), 'teaman-guides-'));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(vault, path)), { recursive: true });
      writeFileSync(join(vault, path), content);
    }
    return vault;
  }

  // The header lists guides on every page; a build reads them once per vault.
  it('reads the vault once in a build, and on every call in dev', async () => {
    const dir = write({ 'guides/a/SUMMARY.md': '- [One](one.md)\n', 'guides/a/one.md': '# One' });
    const addGuide = (slug: string) => {
      mkdirSync(join(dir, 'guides', slug), { recursive: true });
      writeFileSync(join(dir, 'guides', slug, 'SUMMARY.md'), '- [One](one.md)\n');
      writeFileSync(join(dir, 'guides', slug, 'one.md'), '# One');
    };
    vi.stubEnv('DEV', false);
    try {
      expect((await listGuides(dir)).map(g => g.slug)).toEqual(['a']);
      addGuide('b');
      expect((await listGuides(dir)).map(g => g.slug)).toEqual(['a']);
    } finally {
      vi.unstubAllEnvs();
    }
    addGuide('c');
    expect((await listGuides(dir)).map(g => g.slug)).toEqual(['a', 'b', 'c']);
  });

  it('returns guides sorted by slug, with chapters in SUMMARY order', async () => {
    const dir = write({
      'guides/zebra/SUMMARY.md': '# Zebra Guide\n- [Ch](ch.md)\n',
      'guides/zebra/ch.md': '# Ch',
      'guides/alpha/SUMMARY.md': '# Alpha Guide\n- [Two](<Part Two.md>)\n- [One](one.md)\n',
      'guides/alpha/one.md': '# One',
      'guides/alpha/Part Two.md': '# Two',
    });
    const guides = await listGuides(dir);
    expect(guides.map(g => [g.slug, g.title])).toEqual([['alpha', 'Alpha Guide'], ['zebra', 'Zebra Guide']]);
    expect(guides[0].chapters).toEqual([
      { slug: 'part-two', entryId: 'alpha/part-two', title: 'Two' },
      { slug: 'one', entryId: 'alpha/one', title: 'One' },
    ]);
    expect(guides[0].problems).toEqual([]);
  });

  it('returns an empty array when no summaries exist', async () => {
    expect(await listGuides(write({}))).toEqual([]);
  });

  it('hides drafted and _-prefixed guides, and drafted chapters', async () => {
    const dir = write({
      'guides/live/SUMMARY.md': '- [A](a.md)\n- [B](b.md)\n',
      'guides/live/a.md': '---\ndraft: true\n---\n# A',
      'guides/live/b.md': '# B',
      'guides/wip/SUMMARY.md': '---\ndraft: true\n---\n- [A](a.md)\n',
      'guides/wip/a.md': '# A',
      'guides/_tpl/SUMMARY.md': '- [A](a.md)\n',
      'guides/_tpl/a.md': '# A',
    });
    const guides = await listGuides(dir);
    expect(guides.map(g => g.slug)).toEqual(['live']);
    expect(guides[0].chapters.map(c => c.slug)).toEqual(['b']);
  });

  it('leaves out a chapter it cannot serve, and reports it', async () => {
    const dir = write({ 'guides/g/SUMMARY.md': '- [Here](here.md)\n- [Gone](gone.md)\n', 'guides/g/here.md': '# Here' });
    const [guide] = await listGuides(dir);
    expect(guide.chapters.map(c => c.slug)).toEqual(['here']);
    expect(guide.problems).toEqual(['g/SUMMARY.md points at missing chapter gone.md']);
  });
});
