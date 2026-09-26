import { getCollection } from 'astro:content';
import { getPublished, isPublishedEntry } from './published';
import { entryId, guideChapterHref } from './entry-identity.mjs';
import { parseReferenceSummary } from './reference-documents.mjs';

export interface GuideChapter {
  /** Entry id within the guide — the chapter's URL segment. */
  slug: string;
  title: string;
}

export interface Guide {
  slug: string;
  title: string;
  chapters: GuideChapter[];
}

const base = import.meta.env.BASE_URL;

/** URL for a chapter. The first chapter of a guide is served at the guide root. */
export function chapterHref(guide: Guide, chapterSlug: string): string {
  return guideChapterHref(base, guide.slug, guide.chapters.map(chapter => chapter.slug), chapterSlug);
}

export function guideSlugFromSummaryId(id: string): string {
  return id.replace(/\/summary$/i, '');
}

/**
 * Every published guide, with its published chapters in SUMMARY order. A
 * drafted (or `_`-prefixed) SUMMARY.md hides the guide; a drafted chapter drops
 * out of the chapter list, so the next chapter takes its place — including at
 * the guide root.
 */
export async function listGuides(): Promise<Guide[]> {
  const [summaries, chapters] = await Promise.all([getPublished('guideSummaries'), getCollection('guides')]);
  const hidden = new Set(chapters.filter(chapter => !isPublishedEntry('guides', chapter)).map(chapter => chapter.id));
  return summaries
    .map(summary => {
      const guide = parseGuide(guideSlugFromSummaryId(summary.id), summary.body ?? '');
      return { ...guide, chapters: guide.chapters.filter(chapter => !hidden.has(`${guide.slug}/${chapter.slug}`)) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const guides = await listGuides();
  return guides.find(guide => guide.slug === slug) ?? null;
}

/**
 * A guide's `SUMMARY.md` is the same mdBook-style chapter index a reference
 * book uses, so it goes through the same CommonMark parser rather than the
 * line regex this used to carry — which only understood `-`/`*` bullets and
 * silently dropped chapters written as a numbered list, with a link title, or
 * with an angle-bracket destination.
 *
 * Guides are flat, so the parser's nesting depth is ignored; `rootRelative`
 * keeps the long-standing tolerance for `/chapter.md`.
 */
export function parseGuide(slug: string, summary: string): Guide {
  let title = slug.replace(/-/g, ' ');
  for (const line of summary.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) title = h1[1];
  }

  const chapters: GuideChapter[] = parseReferenceSummary(summary, { rootRelative: true })
    .map(chapter => ({ title: chapter.title, slug: entryId('guide', chapter.path) }));

  return { slug, title, chapters };
}
