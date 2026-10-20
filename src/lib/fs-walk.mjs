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

/** A path relative to some root, `/`-separated whatever the platform. */
export function toPosix(path) {
  return path.split(sep).join('/');
}

/**
 * Every `.md` file under `dir`, recursively, sorted by name at each level so
 * discovery order (and therefore `doctor`'s output) is deterministic rather
 * than filesystem-dependent. A missing directory yields nothing. Dot-prefixed
 * files and directories are never walked: Astro's glob loaders do not see
 * them, so nothing else may.
 *
 * @param {string} dir
 * @param {{ skipUnderscore?: boolean }} [options]
 *   `skipUnderscore` drops paths with an `_`-prefixed segment — the publish
 *   rule's (`publication.mjs`). Only for discovery that feeds the site
 *   directly; lints must see every file, as Astro's glob loaders do.
 */
export function walkMarkdown(dir, { skipUnderscore = false } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (entry.name.startsWith('.')) return [];
      if (skipUnderscore && entry.name.startsWith('_')) return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(path, { skipUnderscore });
      return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [path] : [];
    });
}

// Directories that hold no vault attachments: tooling state and build output
// (a vault built in place writes `dist/`, full of copies of its own images).
const NOT_ATTACHMENTS = new Set(['node_modules', 'dist']);

/**
 * Can this vault-relative path be an attachment? Not under a dotted entry
 * (`.obsidian/`, `.git/`) or a tooling/build directory. `![[embed]]`s resolve
 * only to such files (`vault-index.mjs`), and the dev server serves only such
 * files as embeds (`html-embeds.mjs`).
 *
 * @param {string} relPath
 */
export function isAttachmentPath(relPath) {
  return !relPath.split(/[/\\]/).some(segment => segment.startsWith('.') || NOT_ATTACHMENTS.has(segment));
}
