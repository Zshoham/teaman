import type { EntryType } from './collections.mjs';

/** One chapter of a book (a guide, a reference book), in SUMMARY order. */
export interface BookChapter {
  /** Relative to the book's directory, `/`-separated, spelled as on disk. */
  path: string;
  title: string;
  depth: number;
  /** Absolute file. */
  sourcePath: string;
  /** Entry id of the chapter's file in its type's collection. */
  id: string;
  /** A guide chapter's id within the guide: its URL segment. */
  slug?: string;
  /** A reference book chapter's anchor in the assembled page (published chapters). */
  anchor?: string;
  /** A published reference book chapter's Markdown, as joined into the book (`assembleReferenceBook`). */
  preparedBody?: string;
  data: Record<string, unknown>;
  body: string;
  /** The publish rule, applied to the chapter and to its book. */
  published: boolean;
  /** Why its frontmatter cannot be read. Never published. */
  error?: string;
}

export interface CatalogRecord {
  type: EntryType;
  /** Entry id; a guide's is its slug, a reference book's its directory's. */
  id: string;
  /** Absolute file; a guide's or a reference book's is its SUMMARY.md. */
  sourcePath: string;
  /** Under the type's vault directory, `/`-separated. */
  relPath: string;
  data: Record<string, unknown>;
  body: string;
  published: boolean;
  /** Why the file cannot become an entry. Never published. */
  error?: string;
  /** What the record's schema rejects in its frontmatter (files read as entries). */
  issues?: string[];
  /** A guide's or a reference book's chapters. */
  chapters?: BookChapter[];
  /** Per-type discovery fields (deck text, ADR number, book chapters, …). */
  [field: string]: unknown;
}

/** One Markdown file in a type's vault directory, read once. */
export interface CatalogFile {
  id: string;
  sourcePath: string;
  relPath: string;
  data: Record<string, unknown>;
  body: string;
  /** What its schema rejects in its frontmatter. */
  issues: string[];
  /** Why its frontmatter cannot be read. */
  error?: string;
}

export interface VaultCatalog {
  vaultDir: string;
  /** Every Markdown file in the directory of `type`, as its glob would see it. */
  files(type: EntryType): CatalogFile[];
  /** Every record of `type`, drafts and unreadable files included. */
  all(type: EntryType): CatalogRecord[];
  /** What the site publishes of `type`. */
  published(type: EntryType): CatalogRecord[];
  /** Is this Markdown file (absolute) part of a page the site renders? */
  isPublishedFile(path: string): boolean;
}

export function openVaultCatalog(vaultDir: string): VaultCatalog;
