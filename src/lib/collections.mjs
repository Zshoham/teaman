/**
 * The content types this engine knows about, as data.
 *
 * Adding a type used to mean editing eight parallel lists — content-paths, the
 * collection schemas, TYPE_LABEL, TAB_LABEL, nav sections, the CLI's
 * CONTENT_DIRS, the Pagefind glob, and an index page — which is how the search
 * glob ended up crawling a `collections/` directory that no longer exists.
 * Everything derivable now derives from here.
 *
 * Deliberately `.mjs`: `bin/teaman.mjs` reads it too, and the CLI cannot import
 * TypeScript. Schemas and loaders are *not* here — they are genuinely per-type
 * and live in `content.config.ts` / `entries.ts`.
 */

/**
 * @typedef {object} CollectionMeta
 * @property {string} type      Entry type discriminator (`Entry.type`).
 * @property {string} dir       Directory under the vault root.
 * @property {string} route     First URL segment. Usually `dir` — `dailies/`
 *   is served at `/daily/`.
 * @property {string} label     Singular type name, shown on an entry card.
 * @property {string} plural    Plural type name, used as the type-filter label.
 * @property {string} unit      What one entry *is* when counted. Matches
 *   `label` except for slides, which are counted as decks.
 * @property {string} units     Plural of `unit`.
 * @property {string|null} emptyMessage  Shown in place of an empty index page;
 *   null for types with no `CollectionIndex` page of their own.
 * @property {boolean} index    Has a `/<route>/` index page listing entries.
 * @property {'all'|'index'|'none'} crawl  How Pagefind indexes the built HTML:
 *   every page, the section index only, or nothing (the type feeds Pagefind
 *   custom records instead, because its content is not in the crawled HTML).
 * @property {'grouped'|'standalone'|null} nav  Where the header link sits, or
 *   null for a type with no nav section. Grouped sections collapse into the
 *   mobile dropdown.
 */

/** @type {readonly CollectionMeta[]} */
export const COLLECTIONS = [
  {
    type: 'note',
    dir: 'notes',
    route: 'notes',
    label: 'note',
    plural: 'notes',
    unit: 'note',
    units: 'notes',
    emptyMessage: 'no notes yet.',
    index: true,
    crawl: 'all',
    nav: 'grouped',
  },
  {
    type: 'reference',
    dir: 'references',
    route: 'references',
    label: 'reference',
    plural: 'references',
    unit: 'reference',
    units: 'references',
    emptyMessage: 'no references yet.',
    index: true,
    crawl: 'all',
    nav: 'grouped',
  },
  {
    type: 'daily',
    dir: 'dailies',
    route: 'daily',
    label: 'daily',
    plural: 'dailies',
    unit: 'day',
    units: 'days',
    // Dailies are read by the week, on /daily/<sunday>/ — there is no index of
    // individual days, so nothing here needs an empty state.
    emptyMessage: null,
    index: false,
    crawl: 'all',
    nav: 'standalone',
  },
  {
    type: 'guide',
    dir: 'guides',
    route: 'guides',
    label: 'guide',
    plural: 'guides',
    unit: 'guide',
    units: 'guides',
    emptyMessage: 'no guides yet.',
    index: true,
    crawl: 'all',
    nav: 'grouped',
  },
  {
    type: 'slides',
    dir: 'slides',
    route: 'slides',
    label: 'slides',
    plural: 'slides',
    // A deck is what you count, even though the type reads "slides".
    unit: 'deck',
    units: 'decks',
    emptyMessage: 'no slide decks yet.',
    index: true,
    // Each deck is a Slidev SPA whose body is JS-rendered, so only the
    // Astro-rendered deck list is crawlable; decks enter the index as custom
    // records built from their markdown.
    crawl: 'index',
    nav: 'grouped',
  },
  {
    type: 'decision',
    dir: 'decisions',
    route: 'decisions',
    label: 'decision',
    plural: 'decisions',
    unit: 'decision',
    units: 'decisions',
    emptyMessage: null,
    index: false,
    // One client island whose ADR bodies only enter the DOM when a modal
    // opens; each ADR is fed in as a custom record deep-linking to its modal.
    crawl: 'none',
    nav: 'standalone',
  },
];

/** Vault content directory names, in registry order. */
export const CONTENT_DIRS = COLLECTIONS.map(collection => collection.dir);

/** Look up one collection by its entry type. */
export function collectionFor(type) {
  const found = COLLECTIONS.find(collection => collection.type === type);
  if (!found) throw new Error(`unknown collection type: ${type}`);
  return found;
}

/**
 * The Pagefind `addDirectory` glob over the built site: the home page plus
 * whatever each collection exposes as crawlable HTML.
 */
export function pagefindGlob() {
  const all = COLLECTIONS.filter(c => c.crawl === 'all').map(c => c.route).sort();
  const indexOnly = COLLECTIONS.filter(c => c.crawl === 'index')
    .map(c => `${c.route}/index.html`)
    .sort();
  return `{index.html,${indexOnly.join(',')}${indexOnly.length ? ',' : ''}{${all.join(',')}}/**/*.html}`;
}
