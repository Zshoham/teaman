/** Entry type discriminator carried by every `Entry`. */
export type EntryType = 'note' | 'reference' | 'daily' | 'guide' | 'slides' | 'decision';

export interface CollectionMeta {
  /** Entry type discriminator (`Entry.type`). */
  type: EntryType;
  /** Directory under the vault root. */
  dir: string;
  /** First URL segment. Usually `dir` — `dailies/` is served at `/daily/`. */
  route: string;
  /** Singular type name, shown on an entry card. */
  label: string;
  /** Plural type name, used as the type-filter label. */
  plural: string;
  /** What one entry *is* when counted (slides are counted as decks). */
  unit: string;
  /** Plural of `unit`. */
  units: string;
  /** Shown in place of an empty index page; null when the type has no index. */
  emptyMessage: string | null;
  /** Has a `/<route>/` index page listing entries. */
  index: boolean;
  /** How Pagefind indexes the built HTML for this type. */
  crawl: 'all' | 'index' | 'none';
  /** Where the header link sits, or null for a type with no nav section. */
  nav: 'grouped' | 'standalone' | null;
}

export const COLLECTIONS: readonly CollectionMeta[];

/** Vault content directory names, in registry order. */
export const CONTENT_DIRS: readonly string[];

/** Look up one collection by its entry type; throws on an unknown type. */
export function collectionFor(type: EntryType): CollectionMeta;

/** The Pagefind `addDirectory` glob over the built site. */
export function pagefindGlob(): string;
