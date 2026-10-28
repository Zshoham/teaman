import { existsSync, readdirSync } from 'fs';
import { basename, join } from 'path';
import { isSummaryFile } from './books.mjs';
import { buildProblems } from './build-problems.mjs';
import { assertCoversTypes, COLLECTIONS, collectionFor } from './collections.mjs';
import { adrNum, SLUG_OVERRIDE_TYPES } from './entry-identity.mjs';
import { resolveEmbed } from './embeds.mjs';
import { wikiLinks } from './obsidian-markdown.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';
import { createVaultIndex } from './vault-index.mjs';

/**
 * Lint a vault's content against what the build will demand of it, without
 * building — what `teaman doctor` reports. What fails the build's own stages
 * comes from `build-problems.mjs`, which those stages ask; the rest reads the
 * same modules the build does (the collection schemas, the vault catalog, the
 * wiki-link index), so passing here means the build accepts the vault, and a
 * problem here is one the build would fail on.
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
    for (const file of FRONTMATTER[type](catalog)) {
      const at = where(type, file.relPath);
      for (const problem of file.error ? [file.error] : file.issues) problems.push(`${at}: ${problem}`);
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

  // Spelled exactly, as the vault catalog finds it (and without `existsSync`,
  // which a case-insensitive filesystem would satisfy).
  const guidesRoot = join(vaultDir, collectionFor('guide').dir);
  if (existsSync(guidesRoot)) {
    for (const entry of readdirSync(guidesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (!readdirSync(join(guidesRoot, entry.name)).some(name => isSummaryFile(name, { caseSensitive: true }))) {
        problems.push(`guides: ${entry.name}/ has no SUMMARY.md (chapter index)`);
      }
    }
  }

  // What the build's stages refuse: books they cannot assemble, guide
  // indexes their schema rejects, deck embeds with no file to stage.
  problems.push(...buildProblems(catalog, { index }));

  // Wiki-links, resolved exactly as the site resolves them. Decks are Slidev,
  // not the site's Markdown pipeline, so their links are never rendered.
  for (const { type, dir } of COLLECTIONS.filter(collection => collection.type !== 'slides')) {
    for (const { sourcePath, relPath, data, body } of catalog.files(type)) {
      const at = where(type, relPath);
      if (!SLUG_OVERRIDE_TYPES.has(type) && data.slug) {
        warnings.push(`${at} sets "slug", which has no effect on ${dir}`);
      }
      lintLinks(body, sourcePath, at, index, problems, warnings);
    }
  }

  return { problems, warnings };
}

/**
 * The files each type's collection validates, as the catalog read them —
 * with what their schema (`frontmatter-schemas.mjs`, the collection's own)
 * rejects in `issues` — so passing here means the build accepts them. A
 * glob-loaded collection validates every file, drafts included; decks and
 * references reach their collections through the engine's own discovery, so
 * what it hands over is checked. A reference that cannot be read, and a
 * guide's SUMMARY.md, are the build's own problems (`buildProblems`),
 * reported there.
 *
 * @type {Record<string, (catalog: import('./vault-catalog.mjs').VaultCatalog) =>
 *   Array<{ relPath: string, issues?: string[], error?: string }>>}
 */
const FRONTMATTER = {
  note: catalog => catalog.all('note'),
  reference: catalog => catalog.all('reference').filter(document => !document.error),
  daily: catalog => catalog.all('daily'),
  // Every chapter file under guides/ is in the guides collection, listed in a
  // SUMMARY or not.
  guide: catalog => catalog.files('guide').filter(file => !isSummaryFile(file.sourcePath, { caseSensitive: true })),
  // The slides collection stores drafted decks too, so it validates them.
  slides: catalog => catalog.all('slides'),
  decision: catalog => catalog.all('decision'),
};
assertCoversTypes(FRONTMATTER, "doctor's frontmatter check");

/**
 * One file's wiki-links and embeds. Parsed with the dialect the PDF and
 * Confluence render with, so code is never linted. An embed must be an image
 * or HTML page the vault has: every renderer fails the build on a note embed
 * or a missing file.
 */
function lintLinks(source, file, at, index, problems, warnings) {
  for (const { target, embed } of wikiLinks(source)) {
    if (embed) {
      const { problem } = resolveEmbed(target, undefined, { resolveAttachment: index.resolveAttachment, fromFile: file });
      if (problem) problems.push(`${at}: ${problem}`);
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
