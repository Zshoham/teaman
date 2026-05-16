import { getCollection } from 'astro:content';
import { stat } from 'fs/promises';
import { join } from 'path';
import { guideSlugFromSummaryId, listGuides } from './guides';
import { slidesRoot } from './content-paths';

export type EntryType = 'note' | 'guide' | 'slides';

export const TYPE_LABEL: Record<EntryType, string> = {
  note: 'note',
  guide: 'guide',
  slides: 'slides',
};

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  excerpt: string;
  tags: string[];
  updated: string;
  created: string;
  /** Display-ready summary string, e.g. "1,234 words" or "12 slides". */
  meta: string;
  href: string;
}

export function wordMeta(words: number): string {
  return `${words.toLocaleString()} words`;
}

export function readingTimeMeta(words: number): string {
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min read`;
}

function slidesMeta(count: number): string {
  return `${count} ${count === 1 ? 'slide' : 'slides'}`;
}

const base = import.meta.env.BASE_URL;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function extractExcerpt(body: string, maxLen = 220): string {
  const cleaned = body
    .replace(/^---\s*$/gm, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, a) => a || p)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '');
  const para = cleaned.split(/\n\s*\n/).map(s => s.trim()).find(Boolean) ?? '';
  if (para.length <= maxLen) return para;
  return para.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

async function safeFileDates(path: string): Promise<{ updated: Date; created: Date }> {
  try {
    const fileStat = await stat(path);
    return { updated: fileStat.mtime, created: fileStat.birthtime };
  } catch {
    const now = new Date();
    return { updated: now, created: now };
  }
}

export async function loadNoteEntries(): Promise<Entry[]> {
  const notes = await getCollection('notes');
  return notes
    .filter(n => !n.data.draft)
    .map(n => {
      const body = (n.body ?? '') as string;
      const date = (n.data.date ?? new Date()) as Date;
      return {
        id: `note-${n.id}`,
        type: 'note' as const,
        title: n.data.title ?? n.id,
        excerpt: extractExcerpt(body),
        tags: n.data.tags ?? [],
        updated: isoDate(date),
        created: isoDate(date),
        meta: wordMeta(wordCount(body)),
        href: `${base}notes/${n.id}/`,
      };
    });
}

export async function loadSlideEntries(): Promise<Entry[]> {
  const slides = await getCollection('slides');
  const entries = slides
    .filter(s => !s.data.draft && !s.id.startsWith('_'))
    .map(async s => {
      const body = (s.body ?? '') as string;
      const slideCount = body.split(/^---\s*$/m).filter(part => part.trim()).length || 1;
      const path = join(slidesRoot, `${s.id}.md`);
      const dates = await safeFileDates(path);
      return {
        id: `slides-${s.id}`,
        type: 'slides' as const,
        title: s.data.title ?? s.id.replace(/-/g, ' '),
        excerpt: extractExcerpt(body),
        tags: s.data.tags ?? [],
        updated: isoDate(dates.updated),
        created: isoDate(dates.created),
        meta: slidesMeta(slideCount),
        href: `${base}slides/${s.id}/`,
      };
    });
  return Promise.all(entries);
}

export async function loadGuideEntries(): Promise<Entry[]> {
  const [chapters, summaries, guides] = await Promise.all([
    getCollection('guides'),
    getCollection('guideSummaries'),
    listGuides(),
  ]);
  const chaptersById = new Map(chapters.map(chapter => [chapter.id, chapter]));
  const summariesBySlug = new Map(
    summaries.map(summary => [guideSlugFromSummaryId(summary.id), summary.body ?? '']),
  );

  const entries = guides.map(async g => {
    const summaryPath = join(g.dir, 'SUMMARY.md');
    const summaryBody = summariesBySlug.get(g.slug) ?? '';
    const summaryDates = await safeFileDates(summaryPath);
    let excerpt = '';
    let words = 0;
    let updated = summaryDates.updated;
    let created = summaryDates.created;

    for (const chapter of g.chapters) {
      const entry = chaptersById.get(`${g.slug}/${chapter.slug}`);
      if (!entry) continue;
      const body = entry.body ?? '';
      if (!excerpt) excerpt = extractExcerpt(body);
      words += wordCount(body);
      const chapterPath = join(g.dir, `${chapter.slug}.md`);
      const chapterDates = await safeFileDates(chapterPath);
      if (chapterDates.updated > updated) updated = chapterDates.updated;
      if (chapterDates.created < created) created = chapterDates.created;
    }

    if (!excerpt) excerpt = extractExcerpt(summaryBody);
    return {
      id: `guide-${g.slug}`,
      type: 'guide' as const,
      title: g.title,
      excerpt,
      tags: [],
      updated: isoDate(updated),
      created: isoDate(created),
      meta: wordMeta(words),
      href: `${base}guides/${g.slug}/`,
    };
  });
  return Promise.all(entries);
}

/** Loads notes, slides, and guides and returns a single list sorted by `updated` desc. */
export async function loadAllEntries(): Promise<Entry[]> {
  const [notes, slides, guides] = await Promise.all([
    loadNoteEntries(),
    loadSlideEntries(),
    loadGuideEntries(),
  ]);
  return [...notes, ...slides, ...guides].sort((a, b) => b.updated.localeCompare(a.updated));
}
