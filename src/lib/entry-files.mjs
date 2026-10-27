import { readFileSync } from 'fs';
import { basename, relative } from 'path';
import matter from 'gray-matter';
import { assertCoversTypes } from './collections.mjs';
import { entryId } from './entry-identity.mjs';
import { normalizeFrontmatter } from './frontmatter-schemas.mjs';
import { toPosix, walkMarkdown } from './fs-walk.mjs';

/**
 * Reading one vault Markdown file as an entry: its id, path, frontmatter, and
 * body, or why its frontmatter cannot be read. The vault catalog, ADR/deck
 * discovery, and the books read files through here, so an unreadable file is
 * reported the same way everywhere instead of throwing out of whichever
 * reader met it first, and every reader sees the frontmatter the site does:
 * normalized by the file's collection schema (`normalizeFrontmatter`), with
 * what that schema rejects in `issues`.
 */

/**
 * Which schema (`FRONTMATTER_SCHEMAS`) a file of `type` is validated
 * against. A guide's SUMMARY.md (spelled exactly, as the `guideSummaries`
 * collection globs for it) is not one of its chapters; a reference book's
 * SUMMARY.md carries what a standalone reference does.
 *
 * @param {import('./collections.mjs').EntryType} type
 * @param {string} sourcePath
 * @returns {keyof typeof import('./frontmatter-schemas.mjs').FRONTMATTER_SCHEMAS}
 */
export function frontmatterKind(type, sourcePath) {
  return FRONTMATTER_KIND[type](sourcePath);
}

const FRONTMATTER_KIND = {
  note: () => 'note',
  reference: () => 'reference',
  guide: path => (basename(path) === 'SUMMARY.md' ? 'guideSummary' : 'guideChapter'),
  slides: () => 'deck',
  daily: () => 'daily',
  decision: () => 'decision',
};
assertCoversTypes(FRONTMATTER_KIND, 'the frontmatter schema of each type');

/** What `doctor` and the catalog say about a file gray-matter rejects. */
export function yamlError(error) {
  return `frontmatter is not valid YAML (${String(error?.message ?? error).split('\n')[0]})`;
}

/**
 * gray-matter, uncached. Called without options it caches each source before
 * parsing it, so a source that failed once parses "successfully" (empty data)
 * every time after: a second file with the same broken frontmatter, or a dev
 * reload of a file still broken, would go unreported.
 *
 * @param {string} source
 */
export function parseFrontmatter(source) {
  return matter(source, {});
}

/**
 * @param {import('./collections.mjs').EntryType} type
 * @param {string} root  the type's vault directory
 * @param {string} sourcePath  absolute
 * @returns {{ id: string, sourcePath: string, relPath: string, data: Record<string, unknown>, body: string, issues: string[], error?: string }}
 *   `error`: the frontmatter is not YAML; `issues`: it is, but its schema
 *   rejects it
 */
export function readEntryFile(type, root, sourcePath) {
  const relPath = toPosix(relative(root, sourcePath));
  let parsed;
  try {
    parsed = parseFrontmatter(readFileSync(sourcePath, 'utf8'));
  } catch (error) {
    return { id: entryId(type, relPath), sourcePath, relPath, data: {}, body: '', issues: [], error: yamlError(error) };
  }
  const { data, issues } = normalizeFrontmatter(frontmatterKind(type, sourcePath), parsed.data);
  return { id: entryId(type, relPath, data), sourcePath, relPath, data, body: parsed.content, issues };
}

/**
 * Every Markdown file under `root` (`walkMarkdown`: drafts and `_` paths
 * included, dot paths not), read with `readEntryFile`.
 *
 * @param {import('./collections.mjs').EntryType} type
 * @param {string} root
 */
export function readEntryFiles(type, root) {
  return walkMarkdown(root).map(path => readEntryFile(type, root, path));
}
