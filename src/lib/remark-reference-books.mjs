import { dirname, join } from 'path';
import { htmlIds, layoutReferenceBook, namespaceHtmlIds, parseChapterMarker } from './reference-book.mjs';

/**
 * The text mdBook derives a heading id from: its text and inline-code content,
 * joined. Raw HTML inside a heading contributes nothing, but the angle brackets
 * of `` `Box<T>` `` are code *content* rather than markup — stripping them as
 * tags would turn that heading into `box` and break every link to it.
 */
function headingText(node) {
  return (node.children ?? []).map(child => {
    if (child.type === 'html') return '';
    if (typeof child.value === 'string') return child.value;
    return headingText(child);
  }).join('');
}

function visit(node, callback) {
  callback(node);
  for (const child of node.children ?? []) visit(child, callback);
}

/**
 * The assembled book's top-level nodes, split at the chapter markers: each
 * chapter's path and anchor, and the nodes up to the next marker. Nodes before
 * the first marker belong to no chapter.
 */
function chaptersOf(tree) {
  const chapters = [];
  for (const child of tree.children) {
    const marker = child.type === 'html' ? parseChapterMarker(child.value) : null;
    if (marker) {
      chapters.push({ ...marker, marker: child, nodes: [] });
      continue;
    }
    chapters.at(-1)?.nodes.push(child);
  }
  return chapters;
}

/**
 * Each top-level node of `tree` with the file it was written in: in a
 * reference book (rendered as its SUMMARY.md), the chapter file the node came
 * from; anywhere else, the file itself. Passes after `remarkReferenceBooks`
 * that resolve something relative to the writing file (wiki-links, embeds)
 * read it through this, as the PDF and `doctor` read each chapter from its
 * own file.
 *
 * @param {{ children: any[] }} tree
 * @param {{ path?: string } | undefined} file
 * @param {(node: any, sourcePath: string | undefined) => void} visit
 */
export function forEachSourceNode(tree, file, visit) {
  let sourcePath = file?.path;
  for (const node of tree.children) {
    sourcePath = node.data?.referenceChapterSource ?? sourcePath;
    visit(node, sourcePath);
  }
}

/**
 * Fix chapter-local identifiers and links after reference chapters are
 * joined: the site's renderer of the book's layout (`reference-book.mjs`).
 * Each emptied chapter marker keeps the chapter's file
 * (`forEachSourceNode`).
 */
export function remarkReferenceBooks() {
  return (tree, file) => {
    const chapters = chaptersOf(tree);
    if (chapters.length === 0) return;
    for (const chapter of chapters) {
      chapter.headings = [];
      chapter.htmlIds = [];
      for (const node of chapter.nodes) {
        visit(node, inner => {
          if (inner.type === 'heading') chapter.headings.push(inner);
          if (inner.type === 'html') chapter.htmlIds.push(...htmlIds(inner.value));
        });
      }
    }
    const layout = layoutReferenceBook(chapters.map(chapter => ({
      path: chapter.path,
      anchor: chapter.anchor,
      headings: chapter.headings.map(headingText),
      htmlIds: chapter.htmlIds,
    })));

    for (const chapter of chapters) {
      const { path, anchor } = chapter;
      chapter.marker.value = '';
      if (file?.path) {
        chapter.marker.data = { ...chapter.marker.data, referenceChapterSource: join(dirname(file.path), path) };
      }
      const ids = layout.headingIds(path);
      chapter.headings.forEach((heading, index) => {
        heading.data ??= {};
        heading.data.hProperties ??= {};
        heading.data.hProperties.id = ids[index];
      });
      for (const node of chapter.nodes) {
        visit(node, inner => {
          if (inner.type === 'html') inner.value = namespaceHtmlIds(inner.value, anchor);
          if (inner.type === 'definition' || inner.type === 'link' || inner.type === 'image') {
            inner.url = layout.rewrite(inner.url, path, { image: inner.type === 'image' });
          }
          if (['definition', 'linkReference', 'imageReference', 'footnoteDefinition', 'footnoteReference'].includes(inner.type)) {
            inner.identifier = `${anchor}:${inner.identifier}`;
          }
        });
      }
    }
  };
}
