import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join, relative, sep } from 'path';
import matter from 'gray-matter';
import { bookProblems } from './books.mjs';
import { COLLECTIONS, collectionFor } from './collections.mjs';
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

  // Frontmatter, validated by the same schemas the content collections use
  // (frontmatter-schemas.mjs). Glob-loaded collections validate every file,
  // drafts included, and so does this.
  const checkFrontmatter = (type, relPath, kind, data) => {
    for (const problem of frontmatterProblems(kind, data)) problems.push(`${where(type, relPath)}: ${problem}`);
  };
  for (const type of ['note', 'daily', 'decision']) {
    for (const record of catalog.all(type)) {
      if (record.error) problems.push(`${where(type, record.relPath)}: ${record.error}`);
      else checkFrontmatter(type, record.relPath, type, record.data);
    }
  }
  // A guide's every Markdown file is in a collection, listed in a SUMMARY or not.
  const guidesRoot = join(vaultDir, collectionFor('guide').dir);
  for (const file of walkMarkdown(guidesRoot)) {
    const relPath = relative(guidesRoot, file).split(sep).join('/');
    let data;
    try {
      ({ data } = matter(readFileSync(file, 'utf8')));
    } catch (error) {
      problems.push(`${where('guide', relPath)}: frontmatter is not valid YAML (${String(error.message).split('\n')[0]})`);
      continue;
    }
    checkFrontmatter('guide', relPath, basename(file).toLowerCase() === 'summary.md' ? 'guideSummary' : 'guideChapter', data);
  }
  // Decks and references reach their collections through the engine's own
  // discovery, so validate what it hands over.
  for (const deck of catalog.published('slides')) checkFrontmatter('slides', deck.relPath, 'deck', deck.data);
  for (const document of catalog.all('reference')) {
    if (!document.error) checkFrontmatter('reference', document.relPath, 'reference', document.data);
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
