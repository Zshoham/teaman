import { readFileSync } from 'fs';
import { relative } from 'path';
import matter from 'gray-matter';
import { entryId } from './entry-identity.mjs';
import { toPosix, walkMarkdown } from './fs-walk.mjs';

/**
 * Reading one vault Markdown file as an entry: its id, path, frontmatter, and
 * body, or why its frontmatter cannot be read. The vault catalog and ADR/deck
 * discovery read files through here, so an unreadable file is reported the
 * same way everywhere instead of throwing out of whichever reader met it
 * first.
 */

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
 * @returns {{ id: string, sourcePath: string, relPath: string, data: Record<string, unknown>, body: string, error?: string }}
 */
export function readEntryFile(type, root, sourcePath) {
  const relPath = toPosix(relative(root, sourcePath));
  try {
    const { data, content } = parseFrontmatter(readFileSync(sourcePath, 'utf8'));
    return { id: entryId(type, relPath, data), sourcePath, relPath, data, body: content };
  } catch (error) {
    return { id: entryId(type, relPath), sourcePath, relPath, data: {}, body: '', error: yamlError(error) };
  }
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
