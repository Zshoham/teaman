import { getCollection } from 'astro:content';
import { join } from 'path';
import { guidesRoot } from './content-paths';

export interface GuideChapter {
  slug: string;
  title: string;
}

export interface Guide {
  slug: string;
  title: string;
  chapters: GuideChapter[];
  dir: string;
}

const base = import.meta.env.BASE_URL;

/** URL for a chapter. The first chapter of a guide is served at the guide root. */
export function chapterHref(guide: Guide, chapterSlug: string): string {
  const isFirst = guide.chapters[0]?.slug === chapterSlug;
  return isFirst
    ? `${base}guides/${guide.slug}/`
    : `${base}guides/${guide.slug}/${chapterSlug}/`;
}

export function guideSlugFromSummaryId(id: string): string {
  return id.replace(/\/summary$/i, '');
}

export async function listGuides(): Promise<Guide[]> {
  const summaries = await getCollection('guideSummaries');
  return summaries
    .map(summary => parseGuide(guideSlugFromSummaryId(summary.id), summary.body ?? ''))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const guides = await listGuides();
  return guides.find(guide => guide.slug === slug) ?? null;
}

export function parseGuide(slug: string, summary: string): Guide {
  let title = slug.replace(/-/g, ' ');
  const chapters: GuideChapter[] = [];
  for (const line of summary.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) { title = h1[1]; continue; }
    const item = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(\.?\/?(.+?)\.md\)/);
    if (item) chapters.push({ title: item[1], slug: item[2] });
  }
  return { slug, title, dir: join(guidesRoot, slug), chapters };
}
