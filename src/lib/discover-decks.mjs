import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import matter from 'gray-matter';

/**
 * Whether a deck id / relative path is publishable: false when any path segment
 * starts with `_`. Accepts `/`-separated ids (Astro collection ids) as well as
 * platform-separated relative paths.
 */
export function isPublishableDeckId(id) {
  return !id
    .split(/[/\\]/)
    .some(segment => segment.startsWith('_'));
}

/** Discover publishable Slidev decks using the same policy for build and search. */
export function discoverDecks(slidesRoot) {
  const decks = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const rel = relative(slidesRoot, path);
      if (!isPublishableDeckId(rel)) continue;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || extname(entry.name) !== '.md') continue;
      const markdown = readFileSync(path, 'utf8');
      const { data } = matter(markdown);
      if (data.draft === true) continue;
      decks.push({
        id: rel.slice(0, -extname(rel).length).split(sep).join('/'),
        path,
        relativePath: rel,
        markdown,
        data,
      });
    }
  }

  walk(slidesRoot);
  return decks;
}
