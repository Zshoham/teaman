import { getCollection, type CollectionEntry } from 'astro:content';
import { adrNum, type AdrStatus } from './adr-shared';
import { isoDate } from './format';

// Re-export the client-safe helpers so server modules can keep importing from
// a single './adr' entry point; the React island imports from './adr-shared'.
export * from './adr-shared';

/** A single Architecture Decision Record, flattened for the timeline view. */
export interface Adr {
  /** Four-digit number parsed from the filename, e.g. "0001". */
  num: string;
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  status: AdrStatus;
  tags: string[];
  summary: string;
  supersedes?: string;
  supersededBy?: string;
  /** The raw collection entry, kept so the page can `render()` the body. */
  entry: CollectionEntry<'decisions'>;
}

/** Loads the `decisions` collection as `Adr`s, sorted newest first. */
export async function loadAdrs(): Promise<Adr[]> {
  const entries = await getCollection('decisions');
  return entries
    .map((e) => ({
      num: adrNum(e.id),
      id: e.id,
      title: e.data.title,
      date: isoDate(e.data.date),
      status: e.data.status,
      tags: e.data.tags ?? [],
      summary: e.data.summary ?? '',
      supersedes: e.data.supersedes,
      supersededBy: e.data.supersededBy,
      entry: e,
    }))
    .sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.num < b.num ? 1 : -1,
    );
}
