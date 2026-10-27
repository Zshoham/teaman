import { basename, dirname, relative } from 'path';
import { isSummaryFile, readBook } from './books.mjs';
import { readEntryFile } from './entry-files.mjs';
import { normalizeFrontmatter } from './frontmatter-schemas.mjs';
import { entryId } from './entry-identity.mjs';
import { isInside, toPosix, walkMarkdown } from './fs-walk.mjs';
import { assembleReferenceBook } from './reference-book.mjs';
import { entryTitle } from './entry-title.mjs';

/**
 * The frontmatter the references collection is handed, normalized by its
 * schema. `title:` with no value parses to null, which the schema rejects —
 * treat it the same as an absent title rather than failing the build, which
 * means filling it in before the schema sees it (the file was read, and
 * judged, as written).
 */
function documentData(data, title) {
  return normalizeFrontmatter('reference', {
    ...data,
    ...(data.title == null ? { title } : {}),
  });
}

/**
 * A reference that cannot become an entry, in the same shape as one that can:
 * `bookProblems` reports its `error`, and the catalog files it like any
 * record.
 */
function failedDocument(referencesRoot, sourcePath, id, error) {
  return {
    id,
    relPath: toPosix(relative(referencesRoot, sourcePath)),
    kind: isSummaryFile(sourcePath) ? 'book' : 'standalone',
    error,
    data: {},
    body: '',
    sourcePath,
    dir: dirname(sourcePath),
    chapters: [],
    missing: [],
    invalid: [],
  };
}

function bookDocument(referencesRoot, summaryPath) {
  const dir = dirname(summaryPath);
  const relDir = toPosix(relative(referencesRoot, dir));
  // A book is named by its directory; `.md` stands in for the extension
  // `entryId` strips, so a dotted directory name keeps its last segment.
  const id = relDir && entryId('reference', `${relDir}.md`);
  if (!id) {
    return failedDocument(referencesRoot, summaryPath, '',
      'references/SUMMARY.md is ambiguous; put each multi-file reference in references/<slug>/SUMMARY.md');
  }

  const book = readBook(summaryPath, { read: path => readEntryFile('reference', referencesRoot, path) });
  if (book.error) return failedDocument(referencesRoot, summaryPath, id, `${relDir}/${basename(summaryPath)}: ${book.error}`);

  // Only the published chapters are assembled: a drafted one is left out, as
  // in a guide.
  const assembled = assembleReferenceBook(book.chapters.filter(chapter => chapter.published));
  const anchored = new Map(assembled.chapters.map(chapter => [chapter.path, chapter]));
  const chapters = book.chapters.map(chapter => anchored.get(chapter.path) ?? chapter);
  const { body } = assembled;
  const title = entryTitle({ data: book.data, body: book.content, id });
  return {
    id,
    relPath: toPosix(relative(referencesRoot, summaryPath)),
    kind: 'book',
    title,
    ...documentData(book.data, title),
    body,
    sourcePath: summaryPath,
    dir,
    chapters,
    missing: book.missing,
    invalid: book.invalid,
  };
}

function standaloneDocument(referencesRoot, sourcePath) {
  const file = readEntryFile('reference', referencesRoot, sourcePath);
  if (file.error) return failedDocument(referencesRoot, sourcePath, file.id, `${file.relPath}: ${file.error}`);
  const title = entryTitle({ data: file.data, body: file.body, id: file.id });
  return {
    id: file.id,
    relPath: file.relPath,
    kind: 'standalone',
    title,
    ...documentData(file.data, title),
    body: file.body,
    sourcePath,
    dir: dirname(sourcePath),
    chapters: [],
    missing: [],
    invalid: [],
  };
}

/**
 * Discover standalone .md references and SUMMARY.md-backed reference books.
 *
 * A book is read, judged, and assembled here, once: `chapters` are every
 * chapter SUMMARY.md lists, each with its `sourcePath`, and the published
 * ones also with the `anchor` and `preparedBody` of the assembled `body`
 * (`assembleReferenceBook`). The site renders that body, the PDF renders
 * those chapters, and the wiki-link index links to those anchors, so the
 * three read one book. A file that cannot become a reference carries an
 * `error` and is otherwise shaped like any other.
 */
export function discoverReferenceDocuments(referencesRoot) {
  const files = walkMarkdown(referencesRoot, { skipUnderscore: true });
  const summaries = files.filter(isSummaryFile);
  const books = summaries.map(path => bookDocument(referencesRoot, path));
  const bookRoots = summaries.map(dirname);
  const standalone = files
    .filter(path => !isSummaryFile(path))
    .filter(path => !bookRoots.some(root => isInside(root, path)))
    .map(path => standaloneDocument(referencesRoot, path));
  const documents = [...books, ...standalone].sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Map();
  return documents.map(document => {
    if (!document.id || document.error) return document;
    const previous = seen.get(document.id);
    if (!previous) {
      seen.set(document.id, document.sourcePath);
      return document;
    }
    return {
      ...document,
      error: `duplicate reference id "${document.id}" from ${previous} and ${document.sourcePath}`,
    };
  });
}
