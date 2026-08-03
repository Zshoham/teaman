/**
 * Filesystem helpers shared by the CLI and the content discovery code. Both
 * needed "is this path inside that directory" and "every .md under here", and
 * both had grown their own copy.
 */
import { existsSync, readdirSync } from 'fs';
import { isAbsolute, join, relative, sep } from 'path';

/**
 * Is `path` inside `root` (or `root` itself)? Used to keep an output directory
 * from swallowing the vault, and a reference book's chapters from escaping it.
 */
export function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Every `.md` file under `dir`, recursively, sorted by name at each level so
 * discovery order (and therefore `doctor`'s output) is deterministic rather
 * than filesystem-dependent. A missing directory yields nothing.
 *
 * @param {string} dir
 * @param {{ skipUnderscore?: boolean }} [options]
 *   `skipUnderscore` drops paths with an `_`-prefixed segment. Reference books
 *   and slide decks use that convention for drafts and partials; Astro's glob
 *   loader does *not* apply it, so the collections it loads must not either.
 */
export function walkMarkdown(dir, { skipUnderscore = false } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (skipUnderscore && entry.name.startsWith('_')) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(path, { skipUnderscore });
      return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [path] : [];
    });
}
