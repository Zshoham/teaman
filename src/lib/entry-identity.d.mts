import type { EntryType } from './collections.mjs';

/** Types whose frontmatter `slug:` replaces the path-derived id. */
export const SLUG_OVERRIDE_TYPES: ReadonlySet<EntryType>;

/** The entry id of one vault file, relative to its type's directory. */
export function entryId(type: EntryType, relPath: string, data?: Record<string, unknown>): string;

/** `generateId` for an Astro `glob()` loader of `type`. */
export function globEntryId(
  type: EntryType,
): (options: { entry: string; data: Record<string, unknown> }) => string;

/** Site URL of an entry served one page per file. */
export function entryHref(base: string, type: 'note' | 'reference' | 'slides', id: string): string;

/** Raw Markdown URL for a published entry. */
export function sourceHref(base: string, collection: string, id: string): string;

export function localIsoDate(d: Date): string;
export function dateFromIsoDate(date: string): Date;
export function sundayOf(d: Date): Date;
/** The ISO date a daily is filed under: a `YYYY-MM-DD` id, else its frontmatter date (UTC). */
export function dailyIsoDate(id: string, date: Date): string;
export function dayAnchor(iso: string): string;
export function weekHref(base: string, weekId: string): string;
/** URL of one day: its section on the week page. */
export function dailyHref(base: string, iso: string): string;

export function guideHref(base: string, guideSlug: string): string;
/** URL of one guide chapter; the first chapter in SUMMARY order is the guide root. */
export function guideChapterHref(
  base: string,
  guideSlug: string,
  chapterSlugs: readonly string[],
  chapterSlug: string,
): string;

export function adrNum(id: string): string;
export function adrHref(base: string, num: string): string;
