/**
 * Whether a vault file is on the site — one rule, for every content type:
 *
 * - `draft: true` in its frontmatter keeps it off (for a guide or a reference
 *   book, on SUMMARY.md: the whole guide or book), and
 * - so does any `_`-prefixed segment in its path under the type's directory
 *   (`notes/_templates/…`, `slides/_wip.md`) — Obsidian's convention for
 *   templates and scratch.
 *
 * Everything that decides what exists asks here: the collection reads
 * (`getPublished` in `published.ts`), the deck catalog, the reference PDF build,
 * search, and the wiki-link index. Client-safe.
 */

/**
 * @param {string} relPath  path under the type's vault directory
 */
export function isPublishedPath(relPath) {
  return !relPath.split(/[/\\]/).some(segment => segment.startsWith('_'));
}

/**
 * @param {{ data?: Record<string, unknown> | null, relPath: string }} file
 */
export function isPublished({ data, relPath }) {
  return data?.draft !== true && isPublishedPath(relPath);
}
