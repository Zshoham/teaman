import { readFileSync } from 'fs';
import { relative, sep } from 'path';
import matter from 'gray-matter';
import { adrNum, entryId } from './entry-identity.mjs';
import { walkMarkdown } from './fs-walk.mjs';

/**
 * Every ADR under `decisionsRoot`, recursively — the same set the `decisions`
 * collection globs, drafts included — with its entry id, number, and parsed
 * frontmatter. The vault catalog (`vault-catalog.mjs`) reads ADRs through this
 * for search, `doctor`, and the wiki-link index; the site reads the collection.
 *
 * @param {string} decisionsRoot
 */
export function discoverDecisions(decisionsRoot) {
  return walkMarkdown(decisionsRoot).map(sourcePath => {
    const { data, content } = matter(readFileSync(sourcePath, 'utf8'));
    const relPath = relative(decisionsRoot, sourcePath).split(sep).join('/');
    const id = entryId('decision', relPath);
    return { id, num: adrNum(id), sourcePath, relPath, data, body: content };
  });
}
