import { mkdirSync, existsSync, cpSync, rmSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, extname, dirname } from 'path';
import { createRequire } from 'module';
import { renderVarsCss, renderLogoConfig, slidevBuildArgs, renderViteConfig, renderDeckEmbedsModule } from './slides-theme.mjs';
import { collectionFor } from '../src/lib/collections.mjs';
import { resolveLogoFile } from '../src/lib/vault-config.mjs';
import { deckEmbedPlan } from '../src/lib/deck-embeds.mjs';
import { openVaultCatalog } from '../src/lib/vault-catalog.mjs';
import { createVaultIndex } from '../src/lib/vault-index.mjs';

/**
 * Build one deck with Slidev's own JS entry, run by the runtime running this
 * script — not `npx`, which needs npm on PATH.
 *
 * Path-agnostic build: relative asset base (./) + hash routing. Slidev's
 * getSlidePath prefixes import.meta.env.BASE_URL while the router is ALSO
 * created with that base, so a sub-path base (e.g. /slides/intro/) gets
 * applied twice on in-app nav — "next" lands on /slides/intro/slides/intro/2
 * → 404. A relative base makes BASE_URL benign (assets resolve relative to
 * the page, so the deck works under any deploy prefix) and hash routing
 * keeps slide changes client-side (#/2), so deep links and refresh never hit
 * the static host's missing SPA fallback (GitLab Pages serves no _redirects).
 * Decks link in from the site by their root URL, which loads slide 1.
 * (Flags live in slidevBuildArgs, guarded by a unit test.)
 *
 * Slide navigation from deeper routes (presenter mode, the overview) needs
 * router paths that are absolute and base-less; Slidev ≥ 52.17 ships that
 * (getSlideRoutePath) — see the routing note in scripts/slides-theme.mjs.
 *
 * @param {string} deckPath
 * @param {{ out: string, theme: string, cwd: string }} options
 */
function slidevBuild(deckPath, { out, theme, cwd }) {
  const pkgPath = createRequire(import.meta.url).resolve('@slidev/cli/package.json');
  const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const slidevBin = join(dirname(pkgPath), typeof bin === 'string' ? bin : bin.slidev);
  execFileSync(process.execPath, [slidevBin, ...slidevBuildArgs(deckPath, { out, theme })], { cwd, stdio: 'inherit' });
}

/**
 * Lay out the Slidev work dir for a vault's decks: a copy of its `slides/`,
 * the engine theme personalised with the vault's `slides` knobs, and every
 * `![[page.html]]` a deck embeds. Slidev resolves themes from the slide file's
 * directory (slidevjs/slidev#1975), so decks build from a copy that can walk
 * up to the engine's node_modules.
 *
 * @param {object} options
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} options.catalog
 * @param {string} options.workDir  replaced wholesale
 * @param {string} options.engineDir
 * @param {Record<string, any>} [options.slidesConfig]  `slides` from teaman.config.js
 * @returns {{ themeDir: string, problems: string[], warnings: string[] }}
 *   `problems` are embeds that resolve to no vault file; the decks cannot build
 */
export function stageSlidesWorkspace({ catalog, workDir, engineDir, slidesConfig = {} }) {
  const { vaultDir } = catalog;
  const problems = [];
  const warnings = [];
  rmSync(workDir, { recursive: true, force: true });
  cpSync(join(vaultDir, collectionFor('slides').dir), workDir, { recursive: true });

  // Slidev merges a vite.config found in the deck's directory; preserve the
  // shared output tree and mute harmless INVALID_ANNOTATION noise (see
  // renderViteConfig).
  writeFileSync(join(workDir, 'vite.config.mts'), renderViteConfig());

  // Stage the engine's Slidev theme next to the decks and personalise the
  // staged copy with the project's `slides` knobs (accent colours + logo), so
  // every deck builds with one consistent style. The committed theme stays
  // pristine; only the staged copy carries the config. Applied to all decks
  // via `--theme` — no deck frontmatter is ever touched.
  const themeDir = join(workDir, 'theme');
  cpSync(join(engineDir, 'resources', 'slidev-theme-teaman'), themeDir, { recursive: true });
  writeFileSync(join(themeDir, 'styles', 'vars.css'), renderVarsCss(slidesConfig));

  const logoSrc = resolveLogoFile(slidesConfig.logo, { vaultDir, engineDir });
  let logoFile = null;
  if (logoSrc) {
    logoFile = `teaman-slide-logo${extname(logoSrc) || '.svg'}`;
    mkdirSync(join(workDir, 'public'), { recursive: true });
    copyFileSync(logoSrc, join(workDir, 'public', logoFile));
  } else if (slidesConfig.logo) {
    warnings.push(`slides.logo "${slidesConfig.logo}" not found in vault/public — skipping slide logo.`);
  }
  writeFileSync(join(themeDir, 'logo.config.ts'), renderLogoConfig(logoFile, { footer: slidesConfig.footer !== false }));

  // The theme's transformer reaches the engine's embed scan through
  // deck-embeds.ts; point the staged copy at this engine by absolute path.
  writeFileSync(join(themeDir, 'deck-embeds.ts'), renderDeckEmbedsModule(join(engineDir, 'src', 'lib', 'deck-embeds.mjs')));

  // `![[page.html]]` embeds: the theme's transformer turns each into an
  // <HtmlEmbed> frame loading `embeds/<target>` relative to the deck; stage
  // the file Obsidian would find where the frame looks. A missing file fails
  // the build, as it does on the site.
  const vaultIndex = createVaultIndex(vaultDir, { catalog });
  for (const deck of catalog.published('slides')) {
    for (const { target, file, dest } of deckEmbedPlan(deck, vaultIndex.resolveAttachment)) {
      if (!file) {
        problems.push(`slides/${deck.relPath}: ![[${target}]]: no HTML file named “${target}” in the vault`);
        continue;
      }
      mkdirSync(dirname(join(workDir, dest)), { recursive: true });
      copyFileSync(file, join(workDir, dest));
    }
  }
  return { themeDir, problems, warnings };
}

/**
 * Build every published deck to `<outDir>/slides/<id>/`. The work dir is
 * removed afterwards, built or not.
 *
 * @param {object} options
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} options.catalog
 * @param {string} options.outDir
 * @param {string} options.workDir
 * @param {string} options.engineDir
 * @param {Record<string, any>} [options.slidesConfig]
 * @param {(deckPath: string, options: { out: string, theme: string, cwd: string }) => void} [options.buildDeck]
 * @param {(message: string) => void} [options.log]
 * @returns {string[]}  the ids of the decks built
 */
export function buildSlides({
  catalog,
  outDir,
  workDir,
  engineDir,
  slidesConfig = {},
  buildDeck = slidevBuild,
  log = console.log,
}) {
  const decks = catalog.published('slides');
  if (decks.length === 0) {
    log('No slide decks found.');
    return [];
  }
  try {
    const { themeDir, problems, warnings } = stageSlidesWorkspace({ catalog, workDir, engineDir, slidesConfig });
    warnings.forEach(warning => console.warn(warning));
    if (problems.length > 0) {
      throw new Error(`Missing embeds:\n${problems.map(line => `  ${line}`).join('\n')}`);
    }
    for (const deck of decks) {
      const out = join(outDir, 'slides', ...deck.id.split('/'));
      mkdirSync(out, { recursive: true });
      log(`Building deck: ${deck.id}`);
      buildDeck(join(workDir, deck.relPath), { out, theme: themeDir, cwd: engineDir });
    }
    return decks.map(deck => deck.id);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { engineDir, outDir, siteConfig, slidesWorkDir, vaultDir } = await import('../src/lib/build-env.mjs');
  if (!existsSync(join(vaultDir, collectionFor('slides').dir))) {
    console.log('No slides directory, skipping.');
  } else {
    try {
      buildSlides({
        catalog: openVaultCatalog(vaultDir),
        outDir,
        workDir: slidesWorkDir,
        engineDir,
        slidesConfig: siteConfig.slides ?? {},
      });
    } catch (error) {
      console.error(error.message ?? error);
      process.exitCode = 1;
    }
  }
}
