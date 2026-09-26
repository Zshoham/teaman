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
