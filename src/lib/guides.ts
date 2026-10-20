import { bookProblems } from './books.mjs';
import { contentRoot } from './content-paths';
import { entryId, guideChapterHref } from './entry-identity.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';

export interface GuideChapter {
  /** Entry id within the guide — the chapter's URL segment. */
  slug: string;
  title: string;
}

export interface Guide {
  slug: string;
  title: string;
  chapters: GuideChapter[];
  /** What keeps this guide from building (`bookProblems`); empty when it builds. */
  problems: string[];
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
 * Every published guide, with its published chapters in SUMMARY order — the
 * vault catalog's guides, so the site lists exactly what the wiki-link index,
 * `doctor`, and Confluence sync see. A drafted (or `_`-prefixed) SUMMARY.md
 * hides the guide; a drafted chapter drops out of the chapter list, so the
 * next chapter takes its place — including at the guide root. A chapter the
 * SUMMARY lists but the guide cannot serve is left out and reported in
 * `problems`, which the guide pages fail the build on.
 */
export async function listGuides(vaultDir: string = contentRoot): Promise<Guide[]> {
  return openVaultCatalog(vaultDir).published('guide')
    .map(guide => ({
      slug: guide.id,
      title: guideTitle(guide.id, guide.body),
      chapters: (guide.chapters as Array<{ path: string; title: string }>)
        .map(chapter => ({ title: chapter.title, slug: entryId('guide', chapter.path) })),
      problems: bookProblems(guide),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const guides = await listGuides();
  return guides.find(guide => guide.slug === slug) ?? null;
}

/** A guide's title: the last `# Heading` of its SUMMARY.md, else its slug. */
export function guideTitle(slug: string, summary: string): string {
  let title = slug.replace(/-/g, ' ');
  for (const line of summary.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) title = h1[1];
  }
  return title;
}
