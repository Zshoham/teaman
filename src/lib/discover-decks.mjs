import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { parseSync } from '@slidev/parser/core';
import { entryId } from './entry-identity.mjs';
import { parseFrontmatter, yamlError } from './entry-files.mjs';
import { normalizeFrontmatter } from './frontmatter-schemas.mjs';
import { toPosix } from './fs-walk.mjs';
import { isPublishedPath } from './publication.mjs';

/**
 * Every Slidev deck under `slidesRoot`, parsed once with Slidev's own parser.
 * The slides collection reads decks here; everything else reads them through
 * the vault catalog (`vault-catalog.mjs`), which applies the publish rule. So
 * the deck cards, the deck build, search, and the wiki-link index agree on
 * which decks exist, what each is called, and where it is served.
 *
 * Drafts are included; `_`-prefixed paths are pruned (they can never be
 * published, and a `_templates/` folder need not parse), and so are dot paths,
 * which no collection sees. A deck whose headmatter does not parse carries an
 * `error` instead of what parsing would have found.
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
      // A `_` or `.` directory prunes its whole subtree.
      if (!isPublishedPath(rel) || entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || extname(entry.name) !== '.md') continue;
      const markdown = readFileSync(path, 'utf8');
      const relPath = toPosix(rel);
      let parsed;
      try {
        parsed = parseFrontmatter(markdown);
      } catch (error) {
        const id = entryId('slides', rel);
        decks.push({
          id, sourcePath: path, relPath, markdown, data: {}, issues: [],
          title: id, tags: [], slideCount: 1, text: '', error: yamlError(error),
        });
        continue;
      }
      // As the slides collection's schema reads it (`tags: a, b` is a list).
      const { data, issues } = normalizeFrontmatter('deck', parsed.data);
      const id = entryId('slides', rel, data);
      const { slides } = parseSync(markdown, path);
      decks.push({
        // The site's name for the deck — its URL and build directory.
        id,
        sourcePath: path,
        relPath,
        markdown,
        data,
        issues,
        title: typeof data.title === 'string' && data.title ? data.title : id.replace(/-/g, ' '),
        tags: Array.isArray(data.tags) ? data.tags : [],
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
