import { readFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';
import matter from 'gray-matter';
import { assertCoversTypes, collectionFor } from './collections.mjs';
import { discoverDecisions } from './discover-decisions.mjs';
import { discoverDecks } from './discover-decks.mjs';
import { entryId } from './entry-identity.mjs';
import { walkMarkdown } from './fs-walk.mjs';
import { isPublished } from './publication.mjs';
import { discoverReferenceDocuments } from './reference-documents.mjs';
import { isSummaryFile, readBook } from './books.mjs';

/**
 * The vault catalog: every entry a vault holds, discovered once per type, with
 * the publish rule (`publication.mjs`) already applied. Everything outside the
 * Astro collections that asks "what is in this vault, and is it on the site?"
 * asks here — the wiki-link index, search, the reference PDFs, the deck build,
 * Confluence sync, and `doctor` — so none of them filters drafts on its own,
 * and none of them can forget to.
 *
 * Two views: `published(type)` is what the site renders; `all(type)` adds
 * drafts and unreadable files, for lints.
 */

const posix = value => value.split(sep).join('/');

/**
 * @typedef {import('./collections.mjs').EntryType} EntryType
 *
 * @typedef {object} CatalogRecord
 * @property {EntryType} type
 * @property {string} id  entry id; a guide's is its slug, a reference book's
 *   its directory's
 * @property {string} sourcePath  absolute file; a guide's or a reference
 *   book's is its SUMMARY.md
 * @property {string} relPath  under the type's vault directory, `/`-separated
 * @property {Record<string, unknown>} data  frontmatter
 * @property {string} body
 * @property {boolean} published
 * @property {string} [error]  why the file cannot become an entry (invalid
 *   YAML, an ambiguous or duplicate id). Never published.
 *
 * Per type, a record also carries what that type's discovery found: a deck its
 * `title`/`tags`/`slideCount`/`text`/`markdown`, an ADR its `num`, a reference
 * its `kind`/`title`/`chapters`/`missing`/`invalid`, a guide its
 * `dir`/`chapters`/`missing`/`invalid` (see `discoverGuides`).
 */

function readEntryFile(type, root, sourcePath) {
  const relPath = posix(relative(root, sourcePath));
  try {
    const { data, content } = matter(readFileSync(sourcePath, 'utf8'));
    return { id: entryId(type, relPath, data), sourcePath, relPath, data, body: content };
  } catch (error) {
    return {
      id: entryId(type, relPath),
      sourcePath,
      relPath,
      data: {},
      body: '',
      error: `frontmatter is not valid YAML (${String(error.message).split('\n')[0]})`,
    };
  }
}

const discoverFiles = type => root => walkMarkdown(root).map(path => readEntryFile(type, root, path));

function frontmatterOf(path) {
  try { return matter(readFileSync(path, 'utf8')).data; } catch { return {}; }
}

/**
 * Every guide under `guidesRoot`: one per SUMMARY.md, read as a book
 * (`books.mjs`) — its chapters in order, plus the listed ones the site cannot
 * serve in `missing` / `invalid`.
 *
 * @param {string} guidesRoot
 */
function discoverGuides(guidesRoot) {
  return walkMarkdown(guidesRoot).filter(isSummaryFile).map(summaryPath => {
    const record = readEntryFile('guide', guidesRoot, summaryPath);
    const id = record.id.replace(/\/summary$/, '');
    if (record.error) return { ...record, id, dir: dirname(summaryPath), chapters: [], missing: [], invalid: [] };
    // Guides have always accepted `/chapter.md` for a chapter in their folder.
    const { dir, chapters, missing, invalid } = readBook(summaryPath, { rootRelative: true });
    return {
      ...record,
      id,
      dir,
      chapters: chapters.map(chapter => ({
        ...chapter,
        relPath: posix(relative(guidesRoot, chapter.sourcePath)),
        data: frontmatterOf(chapter.sourcePath),
      })),
      missing,
      invalid,
    };
  });
}

function discoverReferences(root) {
  return discoverReferenceDocuments(root).map(document => {
    const sourcePath = document.sourcePath ?? document.summaryPath;
    return {
      ...document,
      id: document.id ?? '',
      sourcePath,
      relPath: posix(relative(root, sourcePath)),
      data: document.data ?? {},
      body: document.body ?? '',
    };
  });
}

/** @type {Record<EntryType, (root: string) => object[]>} */
const DISCOVER = {
  note: discoverFiles('note'),
  reference: discoverReferences,
  guide: discoverGuides,
  slides: discoverDecks,
  daily: discoverFiles('daily'),
  decision: discoverDecisions,
};
assertCoversTypes(DISCOVER, 'the vault catalog\'s discovery');

/** The one place a record's `published` flag is set. */
function withPublication(type, record) {
  const published = !record.error && isPublished({ data: record.data, relPath: record.relPath });
  if (type !== 'guide') return { ...record, type, published };
  // A guide's chapters are drafted one by one; a drafted SUMMARY.md hides
  // them all.
  const chapters = record.chapters.map(chapter => ({
    ...chapter,
    published: published && isPublished({ data: chapter.data, relPath: chapter.relPath }),
  }));
  return { ...record, type, published, chapters };
}

/**
 * Open the catalog of `vaultDir`. Each type is discovered the first time it is
 * asked for and then kept: a catalog is a snapshot, so open a new one to see
 * later edits.
 *
 * @param {string} vaultDir
 */
export function openVaultCatalog(vaultDir) {
  const found = new Map();
  const visible = new Map();

  /**
   * Every record of `type`, drafts and unreadable files included.
   *
   * @param {EntryType} type
   * @returns {CatalogRecord[]}
   */
  function all(type) {
    if (!found.has(type)) {
      const root = join(vaultDir, collectionFor(type).dir);
      found.set(type, DISCOVER[type](root).map(record => withPublication(type, record)));
    }
    return found.get(type);
  }

  /**
   * What the site publishes of `type`. A guide keeps only its published
   * chapters.
   *
   * @param {EntryType} type
   * @returns {CatalogRecord[]}
   */
  function published(type) {
    if (!visible.has(type)) {
      const records = all(type).filter(record => record.published);
      visible.set(type, type === 'guide'
        ? records.map(guide => ({ ...guide, chapters: guide.chapters.filter(chapter => chapter.published) }))
        : records);
    }
    return visible.get(type);
  }

  let pageFiles = null;

  /**
   * Is this Markdown file part of a page the site renders? A guide's or a
   * reference book's chapters are; its SUMMARY.md is not.
   *
   * @param {string} path  absolute
   */
  function isPublishedFile(path) {
    pageFiles ??= new Set(Object.keys(DISCOVER).flatMap(type => published(type).flatMap(record =>
      type === 'guide' || record.kind === 'book'
        ? record.chapters.map(chapter => chapter.sourcePath)
        : [record.sourcePath])));
    return pageFiles.has(resolve(path));
  }

  return { vaultDir, all, published, isPublishedFile };
}
