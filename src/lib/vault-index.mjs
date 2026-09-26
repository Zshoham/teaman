import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import matter from 'gray-matter';
import { slug as githubSlug } from 'github-slugger';
import { collectionFor } from './collections.mjs';
import { discoverDecks } from './discover-decks.mjs';
import {
  adrHref,
  adrNum,
  dailyHref,
  dailyIsoDate,
  entryHref,
  entryId,
  guideChapterHref,
  guideHref,
} from './entry-identity.mjs';
import { isInside, walkMarkdown } from './fs-walk.mjs';
import { discoverReferenceDocuments, parseReferenceSummary } from './reference-documents.mjs';

/**
 * Every page-addressable thing the site renders from a vault, and the
 * Obsidian-style lookup from `[[wiki-link]]` text to one of them. The wiki-link
 * remark plugin, `doctor`, and Confluence sync all resolve links here, so they
 * agree on what `[[x]]` means.
 *
 * Membership mirrors what the site publishes: drafts, `_`-prefixed references
 * and decks, SUMMARY.md files, and guide chapters no SUMMARY lists are not
 * targets.
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
 * @property {string} href  site URL, base included
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

function readMatter(path) {
  return matter(readFileSync(path, 'utf8'));
}

function noteEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('note').dir);
  return walkMarkdown(root).flatMap(sourcePath => {
    const { data } = readMatter(sourcePath);
    if (data.draft === true) return [];
    const id = entryId('note', relative(root, sourcePath), data);
    return [{ type: 'note', sourcePath, kind: 'file', href: entryHref(base, 'note', id) }];
  });
}

function referenceEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('reference').dir);
  return discoverReferenceDocuments(root).flatMap(document => {
    if (!document.id || document.error || document.data?.draft === true) return [];
    const href = entryHref(base, 'reference', document.id);
    if (document.kind === 'standalone') {
      return [{ type: 'reference', sourcePath: document.sourcePath, kind: 'file', href }];
    }
    // A book is one page; each chapter is a section of it.
    return document.chapters.map(chapter => ({
      type: 'reference',
      sourcePath: chapter.sourcePath,
      kind: 'file',
      href: `${href}#${chapter.anchor}`,
    }));
  });
}

function guideEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('guide').dir);
  const summaries = walkMarkdown(root).filter(path => basename(path).toLowerCase() === 'summary.md');
  return summaries.flatMap(summaryPath => {
    const dir = dirname(summaryPath);
    const guideSlug = entryId('guide', relative(root, summaryPath)).replace(/\/summary$/, '');
    const chapters = parseReferenceSummary(readMatter(summaryPath).content, { rootRelative: true })
      .map(chapter => ({ path: chapter.path, sourcePath: resolve(dir, chapter.path) }))
      .filter(chapter => isInside(dir, chapter.sourcePath));
    const slugs = chapters.map(chapter => entryId('guide', chapter.path));
    return [
      { type: 'guide', sourcePath: dir, kind: 'folder', href: guideHref(base, guideSlug) },
      ...chapters.map((chapter, index) => ({
        type: 'guide',
        sourcePath: chapter.sourcePath,
        kind: 'file',
        href: guideChapterHref(base, guideSlug, slugs, slugs[index]),
      })),
    ];
  });
}

function slideEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('slides').dir);
  if (!existsSync(root)) return [];
  return discoverDecks(root).map(deck => ({
    type: 'slides',
    sourcePath: deck.path,
    kind: 'file',
    href: entryHref(base, 'slides', deck.id),
  }));
}

function dailyEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('daily').dir);
  return walkMarkdown(root).flatMap(sourcePath => {
    const { data } = readMatter(sourcePath);
    if (data.draft === true) return [];
    const id = entryId('daily', relative(root, sourcePath));
    const date = data.date instanceof Date ? data.date : new Date(String(data.date ?? ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id) && Number.isNaN(date.getTime())) return [];
    return [{ type: 'daily', sourcePath, kind: 'file', href: dailyHref(base, dailyIsoDate(id, date)) }];
  });
}

function decisionEntries(vaultDir, base) {
  const root = join(vaultDir, collectionFor('decision').dir);
  return walkMarkdown(root).map(sourcePath => ({
    type: 'decision',
    sourcePath,
    kind: 'file',
    href: adrHref(base, adrNum(entryId('decision', relative(root, sourcePath)))),
  }));
}

const DISCOVER = [noteEntries, referenceEntries, guideEntries, slideEntries, dailyEntries, decisionEntries];

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
 * @param {{ base?: string }} [options]  normalized site base for hrefs
 */
export function createVaultIndex(vaultDir, { base = '/' } = {}) {
  /** @type {VaultEntry[]} */
  const entries = DISCOVER.flatMap(discover => discover(vaultDir, base))
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

  return { entries, resolve: resolveLink };
}
