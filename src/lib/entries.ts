import { getCollection } from 'astro:content';
import { stat } from 'fs/promises';
import { resolve } from 'path';
import { COLLECTIONS, collectionFor, type EntryType } from './collections.mjs';
import { guideSlugFromSummaryId, listGuides } from './guides';
import { loadAdrs } from './adr';
import { isPublishableDeckId } from './discover-decks.mjs';
import { engineDir } from './build-env.mjs';
import { adrHref, dailyHref, entryHref, guideHref } from './entry-identity.mjs';
import {
  dailyDateId,
  dateFromIsoDate,
  WEEKDAY_LONG,
  type WeekdayShort,
} from './dailies';
import { fmtLongDay, isoDate } from './format';
import { extractExcerpt, plural, wordCount, wordMeta } from './text';

export type { EntryType } from './collections.mjs';

export const TYPE_LABEL = Object.fromEntries(
  COLLECTIONS.map(collection => [collection.type, collection.label]),
) as Record<EntryType, string>;

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

const base = import.meta.env.BASE_URL;

export { isoDate } from './format';

/**
 * Absolute source path of a collection entry. Ids are slugs, not paths, so the
 * file is found through Astro's `filePath` (relative to the project root, which
 * is the engine) rather than rebuilt from the id.
 */
function sourcePath(entry: { filePath?: string }): string {
  return resolve(engineDir, entry.filePath ?? '');
}

async function safeFileDates(path: string): Promise<{ updated: Date; created: Date }> {
  try {
    const fileStat = await stat(path);
    return { updated: fileStat.mtime, created: fileStat.birthtime };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`[teaman] could not stat ${path}: ${code ?? (err as Error).message}`);
    }
    const now = new Date();
    return { updated: now, created: now };
  }
}

/**
 * Notes and references are the same shape of entry: a dated markdown document
 * served one-per-file under its own route. References additionally carry an
 * authored `summary`, which stands in for the extracted excerpt when present.
 */
async function loadDocumentEntries(
  collection: 'notes' | 'references',
  type: 'note' | 'reference',
): Promise<Entry[]> {
  const documents = await getCollection(collection);
  return documents
    .filter(document => !document.data.draft)
    .map(document => {
      const body = (document.body ?? '') as string;
      const date = (document.data.date ?? new Date()) as Date;
      const summary = 'summary' in document.data ? document.data.summary : undefined;
      return {
        id: `${type}-${document.id}`,
        type,
        title: document.data.title ?? document.id,
        excerpt: summary ?? extractExcerpt(body),
        tags: document.data.tags ?? [],
        updated: isoDate(date),
        created: isoDate(date),
        meta: wordMeta(wordCount(body)),
        href: entryHref(base, type, document.id),
      };
    });
}

export function loadNoteEntries(): Promise<Entry[]> {
  return loadDocumentEntries('notes', 'note');
}

export function loadReferenceEntries(): Promise<Entry[]> {
  return loadDocumentEntries('references', 'reference');
}

export async function loadSlideEntries(): Promise<Entry[]> {
  const slides = await getCollection('slides');
  const entries = slides
    .filter(s => !s.data.draft && isPublishableDeckId(s.id))
    .map(async s => {
      const body = (s.body ?? '') as string;
      const slideCount = body.split(/^---\s*$/m).filter(part => part.trim()).length || 1;
      const dates = await safeFileDates(sourcePath(s));
      return {
        id: `slides-${s.id}`,
        type: 'slides' as const,
        title: s.data.title ?? s.id.replace(/-/g, ' '),
        excerpt: extractExcerpt(body),
        tags: s.data.tags ?? [],
        updated: isoDate(dates.updated),
        created: isoDate(dates.created),
        meta: plural(slideCount, 'slide'),
        href: entryHref(base, 'slides', s.id),
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
    summaries.map(summary => [
      guideSlugFromSummaryId(summary.id),
      { body: summary.body ?? '', tags: summary.data.tags ?? [], path: sourcePath(summary) },
    ]),
  );

  const entries = guides.map(async g => {
    const summary = summariesBySlug.get(g.slug);
    const summaryBody = summary?.body ?? '';
    const summaryDates = await safeFileDates(summary?.path ?? '');
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
      const chapterDates = await safeFileDates(sourcePath(entry));
      if (chapterDates.updated > updated) updated = chapterDates.updated;
      if (chapterDates.created < created) created = chapterDates.created;
    }

    if (!excerpt) excerpt = extractExcerpt(summaryBody);
    return {
      id: `guide-${g.slug}`,
      type: 'guide' as const,
      title: g.title,
      excerpt,
      tags: summary?.tags ?? [],
      updated: isoDate(updated),
      created: isoDate(created),
      meta: wordMeta(words),
      href: guideHref(base, g.slug),
    };
  });
  return Promise.all(entries);
}

const WEEKDAY_FROM_INDEX: WeekdayShort[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Daily notes show up in the index alongside regular notes, under their own
 * `daily` type so the home filter can single them out. Each daily file becomes
 * one entry whose href deep-links to its anchor inside the week page.
 */
export async function loadDailyNoteEntries(): Promise<Entry[]> {
  const dailies = await getCollection('dailies');
  return dailies
    .filter(d => !d.data.draft)
    .map(d => {
      const body = (d.body ?? '') as string;
      const iso = dailyDateId(d);
      const date = dateFromIsoDate(iso);
      const weekday = WEEKDAY_LONG[WEEKDAY_FROM_INDEX[date.getDay()]];
      return {
        id: `daily-${iso}`,
        type: 'daily' as const,
        title: `${weekday}, ${fmtLongDay(iso)}`,
        excerpt: extractExcerpt(body),
        tags: d.data.tags ?? [],
        updated: iso,
        created: iso,
        meta: wordMeta(wordCount(body)),
        href: dailyHref(base, iso),
      };
    });
}

/**
 * Architecture Decision Records show up in the index alongside notes. Each links
 * to its detail modal on the decisions page via the `?adr=<num>` deep-link.
 */
export async function loadDecisionEntries(): Promise<Entry[]> {
  const adrs = await loadAdrs();
  return adrs.map(a => {
    const body = (a.entry.body ?? '') as string;
    return {
      id: `decision-${a.num}`,
      type: 'decision' as const,
      title: `ADR-${a.num} · ${a.title}`,
      excerpt: a.summary,
      tags: a.tags,
      updated: a.date,
      created: a.date,
      meta: wordMeta(wordCount(body)),
      href: adrHref(base, a.num),
    };
  });
}

/**
 * Newest first — the order every list in the site is built and paginated in.
 * Returns a new array; the caller's list is left alone.
 *
 * Dates here are day-resolution, so ties are common (every daily written in a
 * batch, a deck and a guide touched the same day). `id` breaks them: without an
 * explicit tie-break, a stable sort falls back to the order the loaders
 * happened to be concatenated in, and the feed reshuffles when that changes.
 */
export function byUpdatedDesc(entries: Entry[]): Entry[] {
  return entries.toSorted((a, b) => b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id));
}

/** One loader per content type, keyed the same way `Entry.type` is. */
export const ENTRY_LOADERS: Record<EntryType, () => Promise<Entry[]>> = {
  note: loadNoteEntries,
  reference: loadReferenceEntries,
  daily: loadDailyNoteEntries,
  guide: loadGuideEntries,
  slides: loadSlideEntries,
  decision: loadDecisionEntries,
};

/** Loads one content type, sorted newest first. */
export async function loadEntriesOfType(type: EntryType): Promise<Entry[]> {
  return byUpdatedDesc(await ENTRY_LOADERS[type]());
}

/** Loads every publishable content type as a single list sorted by `updated` desc. */
export async function loadAllEntries(): Promise<Entry[]> {
  const loaded = await Promise.all(
    COLLECTIONS.map(collection => ENTRY_LOADERS[collection.type]()),
  );
  return byUpdatedDesc(loaded.flat());
}
