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

// ── Dailies ──────────────────────────────────────────────────────────────────
// A daily has no page of its own: it is an anchored section of the week page
// for the Sunday that starts its week.

/**
 * Local-time ISO date (YYYY-MM-DD).
 *
 * Deliberately *not* `format.ts`'s `isoDate`, which is UTC. The two are not
 * interchangeable and the distinction is load-bearing, so the names differ:
 * - `localIsoDate` formats Dates built from local components (`sundayOf`,
 *   `addDays`, `new Date(y, m, d)`). Using the UTC one on those would, on a
 *   positive-offset build, render local midnight as the *previous* UTC day —
 *   rolling a week back and breaking the link to its `/daily/<sunday>/` page.
 * - `isoDate` formats Dates that came from frontmatter, which YAML parses as
 *   UTC midnight. Using this one on those slides the date back a day on any
 *   negative-offset build.
 *
 * @param {Date} d
 */
export function localIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * A `YYYY-MM-DD` string as a local-midnight Date — the inverse of `localIsoDate`.
 *
 * @param {string} date
 */
export function dateFromIsoDate(date) {
  return new Date(`${date}T00:00:00`);
}

/**
 * Sunday of the week containing `d`, in local time.
 *
 * @param {Date} d
 */
export function sundayOf(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

/**
 * The ISO date a daily is filed under. A `YYYY-MM-DD` id supplies it
 * directly; anything else falls back to the required `date` frontmatter, which
 * YAML parses as UTC midnight — hence UTC formatting, not `localIsoDate`.
 *
 * @param {string} id
 * @param {Date} date
 */
export function dailyIsoDate(id, date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) return id;
  return date.toISOString().slice(0, 10);
}

/**
 * Anchor id for a day inside a week page.
 *
 * @param {string} iso
 */
export function dayAnchor(iso) {
  return `day-${iso}`;
}

/**
 * URL of the week page whose id (its Sunday) is `weekId`.
 *
 * @param {string} base
 * @param {string} weekId
 */
export function weekHref(base, weekId) {
  return `${base}${collectionFor('daily').route}/${weekId}/`;
}

/**
 * URL of one day: its section on the week page.
 *
 * @param {string} base
 * @param {string} iso  the day's ISO date (`dailyIsoDate`)
 */
export function dailyHref(base, iso) {
  return `${weekHref(base, localIsoDate(sundayOf(dateFromIsoDate(iso))))}#${dayAnchor(iso)}`;
}

// ── Guides ───────────────────────────────────────────────────────────────────

/**
 * URL of a guide — which is also where its first chapter is served.
 *
 * @param {string} base
 * @param {string} guideSlug
 */
export function guideHref(base, guideSlug) {
  return `${base}${collectionFor('guide').route}/${guideSlug}/`;
}

/**
 * URL of one guide chapter. The first chapter in SUMMARY order is served at the
 * guide root; the rest under `<guide>/<chapter>/`.
 *
 * @param {string} base
 * @param {string} guideSlug
 * @param {readonly string[]} chapterSlugs  the guide's chapters, in SUMMARY order
 * @param {string} chapterSlug
 */
export function guideChapterHref(base, guideSlug, chapterSlugs, chapterSlug) {
  const root = guideHref(base, guideSlug);
  return chapterSlugs[0] === chapterSlug ? root : `${root}${chapterSlug}/`;
}

// ── Decisions ────────────────────────────────────────────────────────────────
// ADRs are one island on the decisions page; each opens as a modal addressed
// by the number in its filename.

/**
 * The ADR number in an entry id's file name (`2026/adr-0007` → `0007`), or the
 * file name itself. Only the last segment counts: a folder like `2026/` is not
 * the number.
 *
 * @param {string} id
 */
export function adrNum(id) {
  const name = id.split('/').at(-1) ?? id;
  const m = name.match(/(\d+)/);
  return m ? m[1] : name;
}

/**
 * URL of one ADR: the decisions page, deep-linked to its modal.
 *
 * @param {string} base
 * @param {string} num
 */
export function adrHref(base, num) {
  return `${base}${collectionFor('decision').route}/?adr=${num}`;
}
