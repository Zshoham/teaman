/**
 * The diagram fence languages this engine renders, as data — the one list of
 * what a ```` ```<lang> ```` fence can draw, and where it is drawn.
 *
 * - `client`: the site rewrites the fence to `<pre class="<lang>">` and the
 *   browser renders it (`src/scripts/<lang>.ts`, loaded by `Layout.astro`), so
 *   it follows the light/dark toggle live. The reference PDF renders it
 *   server-side (`server-diagrams.mjs`); Confluence syncs it as a configured
 *   macro, or as its source.
 * - `build`: the fence compiles to theme-adaptive inline SVG at build time
 *   (`remark-fence-svg.mjs`), because its engine is far too heavy for the
 *   browser. The PDF embeds that SVG, and Confluence uploads it.
 *
 * Every renderer — the site's remark pipeline, the reference PDF, Confluence
 * sync — reads its languages here, and each keeps an adapter per language
 * that a unit test holds to this list, so a new kind is one row plus its
 * adapters, and a missing adapter fails a test rather than a reader. Decks
 * render diagrams through Slidev, not through this list. Client-safe.
 */

/**
 * @typedef {object} DiagramKind
 * @property {string} lang  fence language
 * @property {string} label  display name, in fallbacks and error notices
 * @property {'client'|'build'} render  where the site renders it
 */

/** @type {readonly DiagramKind[]} */
export const DIAGRAM_KINDS = [
  { lang: 'mermaid', label: 'Mermaid', render: 'client' },
  { lang: 'plantuml', label: 'PlantUML', render: 'client' },
  { lang: 'tikz', label: 'TikZ', render: 'build' },
  { lang: 'typst', label: 'Typst', render: 'build' },
  { lang: 'd2', label: 'D2', render: 'build' },
];

/**
 * The diagram kind a fence language names, or undefined for ordinary code.
 *
 * @param {string | null | undefined} lang
 * @returns {DiagramKind | undefined}
 */
export function diagramKind(lang) {
  return DIAGRAM_KINDS.find(kind => kind.lang === lang);
}

/**
 * The language a fence's info string names: its first word, lowercased, with
 * mdBook's comma annotations (`rust,ignore`) split off. Every renderer reads a
 * fence through this, so ```` ```Mermaid ```` is the same fence everywhere.
 *
 * @param {string | null | undefined} info
 * @returns {string}
 */
export function fenceInfoLanguage(info) {
  return (info ?? '').trim().split(/[\s,]+/, 1)[0].toLowerCase();
}

/**
 * The diagram kind a fence's info string names, or undefined for ordinary code.
 *
 * @param {string | null | undefined} info
 * @returns {DiagramKind | undefined}
 */
export function fenceDiagramKind(info) {
  return diagramKind(fenceInfoLanguage(info));
}

/** Languages the browser renders. */
export const CLIENT_DIAGRAM_LANGUAGES = DIAGRAM_KINDS.filter(kind => kind.render === 'client').map(kind => kind.lang);

/** Languages compiled to SVG at build time. */
export const BUILD_DIAGRAM_LANGUAGES = DIAGRAM_KINDS.filter(kind => kind.render === 'build').map(kind => kind.lang);
