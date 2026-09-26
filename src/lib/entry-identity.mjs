import { slug as githubSlug } from 'github-slugger';
import { collectionFor } from './collections.mjs';

/**
 * Where a vault file lives on the site: its entry id, and the URL it is served
 * at. Every caller that names or links an entry — the Astro loaders, the deck
 * build, search, the wiki-link resolver, doctor, Confluence sync — asks here,
 * so there is one slug rule rather than one per caller.
 *
 * Client-safe on purpose (no `fs`): React islands reach it through
 * `dailies-shared.ts` and `adr-shared.ts`.
 */

/**
 * Types whose frontmatter `slug:` replaces the path-derived id. Only types
 * served one page per file: a guide chapter is found through its SUMMARY.md
 * path, a daily is filed by date, a decision by the number in its filename, so
 * an override there would only break the lookup.
 */
export const SLUG_OVERRIDE_TYPES = new Set(['note', 'reference', 'slides']);

/**
 * The entry id of one vault file: its path relative to the type's directory,
 * minus the extension, `github-slugger`-slugged per segment, with a trailing
 * `/index` dropped — the rule Astro's glob loader applies by default, owned
 * here so the non-Astro callers compute the same thing. `data.slug`, when the
 * type honours it, is used verbatim.
 *
 * @param {import('./collections.mjs').EntryType} type
 * @param {string} relPath  path relative to the type's vault directory
 * @param {Record<string, unknown>} [data]  the file's frontmatter
 */
export function entryId(type, relPath, data = {}) {
  if (SLUG_OVERRIDE_TYPES.has(type) && data?.slug) return String(data.slug);
  const segments = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const last = segments.length - 1;
  segments[last] = segments[last].replace(/\.[^.]*$/, '');
  return segments.map(segment => githubSlug(segment)).join('/').replace(/\/index$/, '');
}

/**
 * `generateId` for an Astro `glob()` loader of `type`, so the ids Astro serves
 * are the ids `entryId` computes.
 *
 * @param {import('./collections.mjs').EntryType} type
 */
export function globEntryId(type) {
  return ({ entry, data }) => entryId(type, entry, data);
}

/**
 * Site URL of an entry served one page per file (notes, references, decks):
 * `<base><route>/<id>/`. `base` must already be normalized (`siteBase`,
 * Astro's `BASE_URL`).
 *
 * @param {string} base
 * @param {'note'|'reference'|'slides'} type
 * @param {string} id
 */
export function entryHref(base, type, id) {
  return `${base}${collectionFor(type).route}/${id}/`;
}
