import type { EntryType } from './collections.mjs';

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
