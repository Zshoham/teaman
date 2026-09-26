import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';
import { relative, resolve } from 'path';
import { engineDir } from './build-env.mjs';
import type { EntryType } from './collections.mjs';
import { rootFor } from './content-paths';
import { isPublished } from './publication.mjs';

const TYPE_OF: Record<CollectionKey, EntryType> = {
  notes: 'note',
  references: 'reference',
  guides: 'guide',
  guideSummaries: 'guide',
  slides: 'slides',
  dailies: 'daily',
  decisions: 'decision',
};

/** Whether one collection entry is on the site (see `publication.mjs`). */
export function isPublishedEntry<C extends CollectionKey>(collection: C, entry: CollectionEntry<C>): boolean {
  // `filePath` is relative to the project root, which is the engine.
  const source = resolve(engineDir, entry.filePath ?? '');
  const relPath = relative(rootFor(TYPE_OF[collection]), source);
  return isPublished({ data: entry.data as Record<string, unknown>, relPath });
}

/**
 * `getCollection`, minus everything the site does not publish: drafts and
 * `_`-prefixed paths. Read collections through this, never `getCollection`
 * directly, so the publish rule lives in one place.
 */
export async function getPublished<C extends CollectionKey>(collection: C): Promise<CollectionEntry<C>[]> {
  const entries: CollectionEntry<C>[] = await getCollection(collection);
  return entries.filter(entry => isPublishedEntry(collection, entry));
}
