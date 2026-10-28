import { bookProblems } from './books.mjs';
import { collectionFor } from './collections.mjs';
import { deckEmbedPlan } from './deck-embeds.mjs';
import { createVaultIndex } from './vault-index.mjs';

/**
 * What in a vault fails the build, decided once. Each stage that refuses a
 * vault asks for its part — the reference loader and the PDF stage for
 * `references`, the guide pages for `guides`, build-slides for `slides` — and
 * `doctor` reports every part, so a vault `doctor` passes is one the build
 * accepts, and a new rule is one row here rather than a stage edit plus a
 * mirrored lint.
 *
 * Not here: frontmatter a glob collection's schema rejects (Astro validates
 * those itself; `doctor` checks them with the same schemas), and embeds the
 * site's Markdown pipeline cannot resolve, which it finds as it renders
 * (`remark-wiki-links.mjs`) and `doctor` finds by linting every file.
 */

/**
 * @typedef {'references' | 'guides' | 'slides'} BuildPart
 * @typedef {import('./vault-catalog.mjs').VaultCatalog} VaultCatalog
 * @typedef {{ resolveAttachment(target: string, fromPath?: string): string | null }} AttachmentIndex
 */

const at = (type, message) => `${collectionFor(type).dir}: ${message}`;

/** @type {Record<BuildPart, (catalog: VaultCatalog, index: () => AttachmentIndex) => string[]>} */
const PARTS = {
  // Every reference — drafts too — is a loader entry, and the loader refuses
  // a book it cannot assemble.
  references: catalog => catalog.all('reference').flatMap(bookProblems).map(problem => at('reference', problem)),

  // Every SUMMARY.md is validated by its schema, drafted or not, as the
  // collections validate every file. Only published guides are built, so a
  // drafted guide may list chapters not yet written.
  guides: catalog => [
    ...catalog.all('guide').flatMap(guide => (guide.error ? [guide.error] : guide.issues ?? [])
      .map(problem => at('guide', `${guide.relPath}: ${problem}`))),
    ...catalog.published('guide').flatMap(bookProblems).map(problem => at('guide', problem)),
  ],

  // The slide theme turns `![[page.html]]` into a frame and build-slides
  // stages the file it loads; planned from the theme's own scan.
  slides: (catalog, index) => catalog.published('slides').flatMap(deck =>
    deckEmbedPlan(deck, index().resolveAttachment)
      .filter(({ problem }) => problem)
      .map(({ problem }) => at('slides', `${deck.relPath}: ${problem}`))),
};

/**
 * The problems that fail the build of `catalog`'s vault.
 *
 * @param {VaultCatalog} catalog
 * @param {object} [options]
 * @param {BuildPart[]} [options.parts]  default: all of them
 * @param {AttachmentIndex} [options.index]  the vault's wiki-link index, if the
 *   caller has one; built on demand otherwise
 * @returns {string[]}
 */
export function buildProblems(catalog, { parts = /** @type {BuildPart[]} */ (Object.keys(PARTS)), index } = {}) {
  let vaultIndex = index;
  const lazyIndex = () => (vaultIndex ??= createVaultIndex(catalog.vaultDir, { catalog }));
  return parts.flatMap(part => PARTS[part](catalog, lazyIndex));
}

/**
 * Throw if `part` of the vault cannot build: the stage's refusal.
 *
 * @param {VaultCatalog} catalog
 * @param {BuildPart} part
 * @param {{ index?: AttachmentIndex }} [options]
 */
export function assertBuildable(catalog, part, { index } = {}) {
  const problems = buildProblems(catalog, { parts: [part], index });
  if (problems.length > 0) {
    throw new Error(`The vault cannot build:\n${problems.map(problem => `  ${problem}`).join('\n')}`);
  }
}
