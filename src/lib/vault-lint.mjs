import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join, relative, sep } from 'path';
import matter from 'gray-matter';
import { bookProblems, isSummaryFile } from './books.mjs';
import { assertCoversTypes, COLLECTIONS, collectionFor } from './collections.mjs';
import { deckEmbedPlan } from './deck-embeds.mjs';
import { adrNum, SLUG_OVERRIDE_TYPES } from './entry-identity.mjs';
import { frontmatterProblems } from './frontmatter-schemas.mjs';
import { walkMarkdown } from './fs-walk.mjs';
import { isHtmlEmbed, isImageEmbed, wikiLinks } from './obsidian-markdown.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';
import { createVaultIndex } from './vault-index.mjs';

/**
 * Lint a vault's content against what the build will demand of it, without
 * building — what `teaman doctor` reports. Every check reads the same modules
 * the build does (the collection schemas, the vault catalog, the book rule,
 * the wiki-link index, the deck embed plan), so passing here means the build
 * accepts the vault, and a problem here is one the build would fail on.
 *
 * `problems` fail the build; `warnings` render, but probably not as meant.
 *
 * @param {string} vaultDir
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function lintVault(vaultDir) {
  const problems = [];
  const warnings = [];
  const catalog = openVaultCatalog(vaultDir);
  const index = createVaultIndex(vaultDir, { catalog });
  const where = (type, relPath) => `${collectionFor(type).dir}: ${relPath}`;

  // Frontmatter, validated by the same schemas the content collections use.
  for (const { type } of COLLECTIONS) {
    for (const file of FRONTMATTER[type](catalog, vaultDir)) {
      const at = where(type, file.relPath);
      if (file.error) problems.push(`${at}: ${file.error}`);
      else for (const problem of frontmatterProblems(file.kind, file.data)) problems.push(`${at}: ${problem}`);
    }
  }

  // Lineage pointers should resolve to an ADR that exists in the vault.
  const records = catalog.all('decision');
  const nums = new Set(records.map(record => record.num));
  for (const { sourcePath, data } of records) {
    for (const key of ['supersedes', 'supersededBy']) {
      const ref = data[key];
      if (typeof ref === 'string' && ref && !nums.has(adrNum(ref))) {
        warnings.push(`decisions: ${basename(sourcePath)} ${key} points at missing ${ref}`);
      }
    }
  }

  const guidesRoot = join(vaultDir, collectionFor('guide').dir);
  if (existsSync(guidesRoot)) {
    for (const entry of readdirSync(guidesRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !existsSync(join(guidesRoot, entry.name, 'SUMMARY.md'))) {
        problems.push(`guides: ${entry.name}/ has no SUMMARY.md (chapter index)`);
      }
    }
  }

  // A guide or reference book is a SUMMARY.md and the chapters it lists; the
  // build fails on a chapter it cannot serve. A guide's only error is
  // unreadable YAML, which the frontmatter check above has reported.
  for (const book of [...catalog.all('guide'), ...catalog.all('reference')]) {
    if (book.type === 'guide' && book.error) continue;
    for (const problem of bookProblems(book)) problems.push(`${collectionFor(book.type).dir}: ${problem}`);
  }

  // Wiki-links, resolved exactly as the site resolves them. Decks are Slidev,
  // not the site's Markdown pipeline, so their links are never rendered.
  for (const { type, dir } of COLLECTIONS.filter(collection => collection.type !== 'slides')) {
    const root = join(vaultDir, dir);
    for (const file of walkMarkdown(root)) {
      const at = where(type, relative(root, file).split(sep).join('/'));
      const source = readFileSync(file, 'utf8');
      if (!SLUG_OVERRIDE_TYPES.has(type) && frontmatterOr(source).slug) {
        warnings.push(`${at} sets "slug", which has no effect on ${dir}`);
      }
      lintLinks(source, file, at, index, problems, warnings);
    }
  }

  // Decks render no wiki-links, but the slide theme turns `![[page.html]]`
  // into a frame, and build-slides fails the deck when the file is missing.
  // Planned from the slide theme's own scan, so this checks exactly what
  // build-slides stages.
  for (const deck of catalog.published('slides')) {
    for (const { target, file } of deckEmbedPlan(deck, index.resolveAttachment)) {
      if (!file) problems.push(`slides: ${deck.relPath} embeds missing HTML file ![[${target}]]`);
    }
  }

  return { problems, warnings };
}

/**
 * The files each type's collection validates, and the schema
 * (`frontmatter-schemas.mjs`) each is validated against — so passing here
 * means the build accepts them. A glob-loaded collection validates every
 * file, drafts included; decks and references reach their collections
 * through the engine's own discovery, so what it hands over is checked.
 *
 * @type {Record<string, (catalog: import('./vault-catalog.mjs').VaultCatalog, vaultDir: string) =>
 *   Array<{ relPath: string, kind?: string, data?: object, error?: string }>>}
 */
const FRONTMATTER = {
  note: catalog => fileRecords(catalog, 'note', 'note'),
  reference: catalog => catalog.all('reference')
    .filter(document => !document.error)
    .map(document => ({ relPath: document.relPath, kind: 'reference', data: document.data })),
  daily: catalog => fileRecords(catalog, 'daily', 'daily'),
  // Every Markdown file under guides/ is in a collection, listed in a
  // SUMMARY or not.
  guide: (catalog, vaultDir) => {
    const root = join(vaultDir, collectionFor('guide').dir);
    return walkMarkdown(root).map(file => {
      const relPath = relative(root, file).split(sep).join('/');
      try {
        const { data } = matter(readFileSync(file, 'utf8'));
        return { relPath, kind: isSummaryFile(file) ? 'guideSummary' : 'guideChapter', data };
      } catch (error) {
        return { relPath, error: `frontmatter is not valid YAML (${String(error.message).split('\n')[0]})` };
      }
    });
  },
  slides: catalog => catalog.published('slides').map(deck => ({ relPath: deck.relPath, kind: 'deck', data: deck.data })),
  decision: catalog => fileRecords(catalog, 'decision', 'decision'),
};
assertCoversTypes(FRONTMATTER, "doctor's frontmatter check");

/** A glob-loaded type's every file, with its catalog-parsed frontmatter. */
function fileRecords(catalog, type, kind) {
  return catalog.all(type).map(({ relPath, data, error }) => (error ? { relPath, error } : { relPath, kind, data }));
}

/** A file's frontmatter, or `{}` when it has none or it does not parse. */
function frontmatterOr(source) {
  try { return matter(source).data; } catch { return {}; }
}

/**
 * One file's wiki-links and embeds. Parsed with the dialect the PDF and
 * Confluence render with, so code is never linted. An embed must be an image
 * or HTML page the vault has: every renderer fails the build on a note embed
 * or a missing file.
 */
function lintLinks(source, file, at, index, problems, warnings) {
  for (const { target, embed } of wikiLinks(source)) {
    if (embed) {
      if (!isImageEmbed(target) && !isHtmlEmbed(target)) {
        problems.push(`${at} embeds ![[${target}]]: note embeds are not supported; link it with [[${target}]]`);
      } else if (!index.resolveAttachment(target, file)) {
        problems.push(`${at} embeds missing ${isHtmlEmbed(target) ? 'HTML file' : 'image'} ![[${target}]]`);
      }
      continue;
    }
    const link = `[[${target}]]`;
    const resolution = index.resolve(target, file);
    if (!resolution) {
      warnings.push(`${at} links to missing ${link}`);
      continue;
    }
    const { entry, via, fragment, alternatives } = resolution;
    if (fragment) {
      warnings.push(`${at} ${link}: heading links are not supported; linking the page`);
    }
    if (via === 'slug') {
      warnings.push(`${at} ${link} only matches ${entry.path} by slug; Obsidian will not resolve it`);
    }
    if (alternatives.length > 0) {
      warnings.push(`${at} ${link} matches ${alternatives.length + 1} pages; linking ${entry.path} (qualify it as [[${entry.path}]])`);
    }
  }
}
