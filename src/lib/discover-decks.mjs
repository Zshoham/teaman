import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import matter from 'gray-matter';
import { parseSync } from '@slidev/parser/core';
import { entryId } from './entry-identity.mjs';
import { isPublished, isPublishedPath } from './publication.mjs';

/** `tags: a, b` and `tags: [a, b]` both mean two tags, as in the collection schema. */
function tagList(value) {
  if (typeof value === 'string') return value.split(',').map(tag => tag.trim()).filter(Boolean);
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * The deck catalog: every publishable Slidev deck under `slidesRoot`, parsed
 * once with Slidev's own parser. The slides collection, the deck build, search,
 * and the wiki-link index all read decks here, so they agree on which decks
 * exist, what each is called, and where it is served.
 *
 * Only published decks (see `publication.mjs`).
 *
 * @param {string} slidesRoot
 */
export function discoverDecks(slidesRoot) {
  const decks = [];
  if (!existsSync(slidesRoot)) return decks;

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const rel = relative(slidesRoot, path);
      // A `_` directory prunes its whole subtree.
      if (!isPublishedPath(rel)) continue;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || extname(entry.name) !== '.md') continue;
      const markdown = readFileSync(path, 'utf8');
      const { data } = matter(markdown);
      if (!isPublished({ data, relPath: rel })) continue;
      const id = entryId('slides', rel, data);
      const { slides } = parseSync(markdown, path);
      decks.push({
        // The site's name for the deck — its URL and build directory.
        id,
        path,
        relativePath: rel,
        markdown,
        data,
        title: typeof data.title === 'string' && data.title ? data.title : id.replace(/-/g, ' '),
        tags: tagList(data.tags),
        slideCount: Math.max(1, slides.length),
        // What a reader sees: every slide's content, without per-slide
        // frontmatter, separators, or presenter notes.
        text: slides.map(slide => slide.content).filter(Boolean).join('\n\n'),
      });
    }
  }

  walk(slidesRoot);
  return decks;
}
