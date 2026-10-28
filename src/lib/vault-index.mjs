import { existsSync, readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { slug as githubSlug } from 'github-slugger';
import {
  adrHref,
  dailyHref,
  dailyIsoDate,
  entryHref,
  guideChapterHref,
  guideHref,
} from './entry-identity.mjs';
import { assertCoversTypes } from './collections.mjs';
import { entryTitle } from './entry-title.mjs';
import { isAttachmentPath } from './fs-walk.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';

/**
 * Every page-addressable thing the site renders from a vault, and the
 * Obsidian-style lookup from `[[wiki-link]]` text to one of them. The wiki-link
 * remark plugin, `doctor`, and Confluence sync all resolve links here, so they
 * agree on what `[[x]]` means.
 *
 * Membership is what the vault catalog publishes (`vault-catalog.mjs`):
 * drafts, `_`-prefixed paths, SUMMARY.md files, and guide chapters no SUMMARY
 * lists are not targets.
 */

const posix = value => value.replace(/\\/g, '/');
const withoutMd = value => value.replace(/\.md$/i, '');

/**
 * @typedef {object} VaultEntry
 * @property {import('./collections.mjs').EntryType} type
 * @property {string} path  vault-relative, `/`-separated, no `.md` — what a
 *   path-qualified link (`[[guides/intro/setup]]`) is matched against
 * @property {string} sourcePath  absolute file (or, for a guide, directory)
 * @property {'file'|'folder'} kind  a guide is linkable by its folder name
 * @property {string} title  the page's title, as the site titles it: a
 *   book chapter's is its SUMMARY.md link text
 * @property {string} href  site URL, base included
 * @property {string} [reference]  a reference's: the reference's entry id
 * @property {string} [anchor]  a reference book chapter's: its anchor in the
 *   book's page and PDF
 */

/**
 * @typedef {object} WikiLinkResolution
 * @property {VaultEntry} entry  the target (Obsidian's tie-break applied)
 * @property {string} href
 * @property {'obsidian'|'slug'} via  `slug` when only the legacy slug
 *   comparison matched — Obsidian itself would not resolve the link
 * @property {boolean} fragment  the link carried a `#heading`/`#^block` part,
 *   which is dropped: wiki-links address pages
 * @property {VaultEntry[]} alternatives  other entries the link also matched
 */

/** A file entry's title (`entry-title.mjs`). */
const titleOf = record => entryTitle({ data: record.data, body: record.body, id: record.id });

function notePages(catalog, base) {
  return catalog.published('note').map(note => (
    { type: 'note', sourcePath: note.sourcePath, kind: 'file', title: titleOf(note), href: entryHref(base, 'note', note.id) }));
}

function referencePages(catalog, base) {
  return catalog.published('reference').flatMap(document => {
    const href = entryHref(base, 'reference', document.id);
    const reference = document.id;
    if (document.kind === 'standalone') {
      return [{ type: 'reference', sourcePath: document.sourcePath, kind: 'file', title: document.title, href, reference }];
    }
    // A book is one page; each chapter is a section of it.
    return document.chapters.map(chapter => ({
      type: 'reference',
      sourcePath: chapter.sourcePath,
      kind: 'file',
      title: chapter.title,
      href: `${href}#${chapter.anchor}`,
      reference,
      anchor: chapter.anchor,
    }));
  });
}

function guidePages(catalog, base) {
  return catalog.published('guide').flatMap(guide => {
    // Drafted chapters are already gone, as they are on the site, so the first
    // published chapter is the one served at the guide root.
    const slugs = guide.chapters.map(chapter => chapter.slug);
    return [
      { type: 'guide', sourcePath: guide.dir, kind: 'folder', title: titleOf(guide), href: guideHref(base, guide.id) },
      ...guide.chapters.map((chapter, index) => ({
        type: 'guide',
        sourcePath: chapter.sourcePath,
        kind: 'file',
        title: chapter.title,
        href: guideChapterHref(base, guide.id, slugs, slugs[index]),
      })),
    ];
  });
}

function deckPages(catalog, base) {
  return catalog.published('slides').map(deck => ({
    type: 'slides',
    sourcePath: deck.sourcePath,
    kind: 'file',
    title: deck.title,
    href: entryHref(base, 'slides', deck.id),
  }));
}

function dailyPages(catalog, base) {
  return catalog.published('daily').flatMap(({ id, sourcePath, data, body }) => {
    // The catalog has coerced a valid `date`; an invalid one fails the build.
    const { date } = data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id) && !(date instanceof Date)) return [];
    const href = dailyHref(base, dailyIsoDate(id, /** @type {Date} */ (date)));
    return [{ type: 'daily', sourcePath, kind: 'file', title: entryTitle({ data, body, id }), href }];
  });
}

function decisionPages(catalog, base) {
  return catalog.published('decision').map(record => ({
    type: 'decision',
    sourcePath: record.sourcePath,
    kind: 'file',
    title: titleOf(record),
    href: adrHref(base, record.num),
  }));
}

/** Every non-Markdown file in the vault, as `{ path, sourcePath }`. */
function attachmentFiles(vaultDir) {
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!isAttachmentPath(entry.name)) continue;
      const sourcePath = join(dir, entry.name);
      if (entry.isDirectory()) walk(sourcePath);
      else if (entry.isFile() && !/\.md$/i.test(entry.name)) {
        files.push({ path: posix(relative(vaultDir, sourcePath)), sourcePath });
      }
    }
  };
  if (existsSync(vaultDir)) walk(vaultDir);
  return files;
}

// The pages each content type puts on the site, from its published records.
const PAGES = {
  note: notePages,
  reference: referencePages,
  guide: guidePages,
  slides: deckPages,
  daily: dailyPages,
  decision: decisionPages,
};
assertCoversTypes(PAGES, 'the wiki-link index');

/** Split a link into its page part and whether it carried a `#` fragment. */
function parseTarget(raw) {
  const hash = raw.indexOf('#');
  const page = withoutMd(posix(hash === -1 ? raw : raw.slice(0, hash)).trim())
    .replace(/^(\.\/|\/)+/, '');
  return { page, fragment: hash !== -1 };
}

const slugPath = path => path.split('/').map(segment => githubSlug(segment)).join('/');

/**
 * Entries whose path matches `page`: the whole vault-relative path or a
 * trailing run of segments when the link is path-qualified, the last segment
 * alone when it is a bare name. `key` normalizes both sides.
 */
function matching(entries, page, key) {
  const wanted = key(page);
  if (!wanted) return [];
  const qualified = wanted.includes('/');
  return entries.filter(entry => {
    const path = key(entry.path);
    if (qualified) return path === wanted || path.endsWith(`/${wanted}`);
    return path.split('/').at(-1) === wanted;
  });
}

/**
 * Obsidian's tie-break: an entry in the linking file's own folder, then the
 * shortest path, then alphabetical so the choice is stable.
 */
function rank(candidates, fromDir) {
  return candidates.toSorted((a, b) =>
    Number(dirname(b.path) === fromDir) - Number(dirname(a.path) === fromDir)
    || a.path.length - b.path.length
    || a.path.localeCompare(b.path));
}

/**
 * Index `vaultDir` once. Cheap enough to rebuild per build, not per link.
 *
 * @param {string} vaultDir
 * @param {{ base?: string, catalog?: import('./vault-catalog.mjs').VaultCatalog }} [options]
 *   `base`: normalized site base for hrefs. `catalog`: an already-open catalog
 *   of `vaultDir`, to share its discovery.
 */
export function createVaultIndex(vaultDir, { base = '/', catalog = openVaultCatalog(vaultDir) } = {}) {
  /** @type {VaultEntry[]} */
  const entries = Object.values(PAGES).flatMap(pages => pages(catalog, base))
    .map(entry => ({ ...entry, path: withoutMd(posix(relative(vaultDir, entry.sourcePath))) }));

  const lower = value => value.toLowerCase();

  /**
   * Resolve one `[[target]]` (alias already removed) as linked from `fromPath`
   * (absolute; optional). Returns null when nothing the site renders matches.
   *
   * @param {string} target
   * @param {string} [fromPath]
   * @returns {WikiLinkResolution | null}
   */
  function resolveLink(target, fromPath) {
    const { page, fragment } = parseTarget(target);
    const fromRel = fromPath ? withoutMd(posix(relative(vaultDir, fromPath))) : '';

    // `[[#Heading]]` is a link to the page it is written on.
    if (!page) {
      const self = entries.find(entry => entry.kind === 'file' && entry.path === fromRel);
      return self ? { entry: self, href: self.href, via: 'obsidian', fragment, alternatives: [] } : null;
    }

    let via = 'obsidian';
    let candidates = matching(entries, page, lower);
    if (candidates.length === 0) {
      via = 'slug';
      candidates = matching(entries, page, slugPath);
    }
    if (candidates.length === 0) return null;

    const [entry, ...alternatives] = rank(candidates, dirname(fromRel));
    return { entry, href: entry.href, via, fragment, alternatives };
  }

  let attachments = null;

  /**
   * Resolve an `![[embed]]` target to a file anywhere in the vault, the way
   * Obsidian finds attachments: by file name (or a trailing path), case-
   * insensitively, same folder first, then the shortest path.
   *
   * @param {string} target  e.g. `diagram.png`, `assets/diagram.png`
   * @param {string} [fromPath]  the embedding file (absolute)
   * @returns {string | null}  absolute path of the attachment
   */
  function resolveAttachment(target, fromPath) {
    attachments ??= attachmentFiles(vaultDir);
    const wanted = posix(target.split(/[?#]/, 1)[0].trim()).replace(/^(\.\/|\/)+/, '');
    const candidates = matching(attachments, wanted, lower);
    if (candidates.length === 0) return null;
    const fromDir = fromPath ? dirname(posix(relative(vaultDir, fromPath))) : '';
    return rank(candidates, fromDir)[0].sourcePath;
  }

  return { entries, resolve: resolveLink, resolveAttachment };
}

/**
 * A `createVaultIndex` that is rebuilt once it is older than `maxAgeMs`. The
 * Markdown pipeline asks per file: a build renders every file in a burst and a
 * dev save re-renders one, so a short age keeps both cheap and still picks up
 * files added while `teaman dev` runs.
 *
 * @param {string} vaultDir
 * @param {{ base?: string, maxAgeMs?: number }} [options]
 * @returns {() => ReturnType<typeof createVaultIndex>}
 */
export function cachedVaultIndex(vaultDir, { base = '/', maxAgeMs = 2000 } = {}) {
  let index = null;
  let builtAt = 0;
  return () => {
    if (!index || Date.now() - builtAt > maxAgeMs) {
      index = createVaultIndex(vaultDir, { base });
      builtAt = Date.now();
    }
    return index;
  };
}
