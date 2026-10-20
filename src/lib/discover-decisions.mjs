import { adrNum } from './entry-identity.mjs';
import { readEntryFiles } from './entry-files.mjs';

/**
 * Every ADR under `decisionsRoot`, recursively — the same set the `decisions`
 * collection globs, drafts included — with its entry id, number, and parsed
 * frontmatter. The vault catalog (`vault-catalog.mjs`) reads ADRs through this
 * for search, `doctor`, and the wiki-link index; the site reads the collection.
 * An ADR whose frontmatter does not parse carries an `error` instead.
 *
 * @param {string} decisionsRoot
 * @param {ReturnType<typeof readEntryFiles>} [files]  the files under it,
 *   when the caller has already read them
 */
export function discoverDecisions(decisionsRoot, files = readEntryFiles('decision', decisionsRoot)) {
  return files.map(file => ({ ...file, num: adrNum(file.id) }));
}
