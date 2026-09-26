import { readFileSync } from 'fs';
import { relative } from 'path';
import matter from 'gray-matter';
import { adrNum, entryId } from './entry-identity.mjs';
import { walkMarkdown } from './fs-walk.mjs';

/**
 * Every ADR under `decisionsRoot`, recursively — the same set the `decisions`
 * collection globs — with its entry id, number, and parsed frontmatter. Search,
 * `doctor`, and the wiki-link index read ADRs through this; the site reads the
 * collection.
 *
 * @param {string} decisionsRoot
 */
export function discoverDecisions(decisionsRoot) {
  return walkMarkdown(decisionsRoot).map(sourcePath => {
    const { data, content } = matter(readFileSync(sourcePath, 'utf8'));
    const id = entryId('decision', relative(decisionsRoot, sourcePath));
    return { id, num: adrNum(id), sourcePath, data, body: content };
  });
}
