import type { CollectionEntry } from 'astro:content';
import { resolve } from 'path';
import { engineDir } from './build-env.mjs';
import { guideChapterHref } from './entry-identity.mjs';
import { getPublished } from './published';

export interface GuideChapter {
  /** Entry id within the guide — the chapter's URL segment. */
  slug: string;
  /** Id of the chapter's entry in the `guides` collection. */
  entryId: string;
  title: string;
}

export interface Guide {
  slug: string;
  title: string;
  chapters: GuideChapter[];
}

/** A guide as its pages render it: each chapter joined to its collection entry. */
export interface GuidePage extends Guide {
  chapters: Array<GuideChapter & { entry: CollectionEntry<'guides'> }>;
  /** SUMMARY.md: its tags, its body, and the file. */
  summary: { tags: string[]; body: string; sourcePath: string };
}

const base = import.meta.env.BASE_URL;

/** URL for a chapter. The first chapter of a guide is served at the guide root. */
export function chapterHref(guide: Guide, chapterSlug: string): string {
  return guideChapterHref(base, guide.slug, guide.chapters.map(chapter => chapter.slug), chapterSlug);
}

/**
 * The published guides as the site's pages render them: the `guideIndexes`
 * collection (`guide-loader.mjs`: the catalog's guides, stored so a SUMMARY.md
 * edit re-renders them in dev), with each chapter joined to its `guides`
 * collection entry. The one place the two meet, so the guide pages, the feed,
 * and the source route all read the same chapters. Throws on a chapter the
 * collection does not publish — the two publish judgments disagreeing is a
 * bug, not a missing page.
 */
export async function loadGuides(): Promise<GuidePage[]> {
  const [indexes, chapters] = await Promise.all([getPublished('guideIndexes'), getPublished('guides')]);
  const entries = new Map(chapters.map(entry => [entry.id, entry]));
  return indexes
    .map(({ id: slug, data, body, filePath }) => ({
      slug,
      title: data.title,
      chapters: data.chapters.map(chapter => {
        const entry = entries.get(chapter.entryId);
        if (!entry) throw new Error(`guides: ${slug} chapter ${chapter.entryId} is not in the published guides collection`);
        return { ...chapter, entry };
      }),
      // `filePath` is relative to the project root, which is the engine.
      summary: { tags: data.tags, body: body ?? '', sourcePath: resolve(engineDir, filePath ?? '') },
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
