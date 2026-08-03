import { mkdirSync, existsSync, cpSync, rmSync, writeFileSync, copyFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, extname } from 'path';
import { renderVarsCss, renderLogoConfig, resolveLogoSource, slidevBuildArgs, renderViteConfig } from './slides-theme.mjs';
import { discoverDecks } from '../src/lib/discover-decks.mjs';
import { engineDir, outDir, publicDir, teamanConfig, vaultDir } from '../src/lib/build-env.mjs';

const slidesSrcDir = join(vaultDir, 'slides');
const slidesTmpDir = process.env.TEAMAN_SLIDES_WORK ?? join(engineDir, '.slides-build');
const slidesOutDir = join(outDir, 'slides');

// `slides` knobs from teaman.config.js; absent or malformed → theme defaults.
const slidesConfig = teamanConfig.slides ?? {};

if (!existsSync(slidesSrcDir)) {
  console.log('No slides directory, skipping.');
  process.exit(0);
}

const decks = discoverDecks(slidesSrcDir);

if (decks.length === 0) {
  console.log('No slide decks found.');
  process.exit(0);
}

// Slidev resolves themes from the slide file's directory (slidevjs/slidev#1975).
// Copy the vault's slides into the engine dir so slidev can find node_modules
// by walking up the directory tree.
rmSync(slidesTmpDir, { recursive: true, force: true });
cpSync(slidesSrcDir, slidesTmpDir, { recursive: true });

// Slidev merges a vite.config found in the deck's directory; we use it to mute
// Rolldown's harmless INVALID_ANNOTATION noise (see renderViteConfig).
writeFileSync(join(slidesTmpDir, 'vite.config.mts'), renderViteConfig());

// Stage the engine's Slidev theme next to the decks and personalise the staged
// copy with the project's `slides` knobs (accent colours + logo), so every deck
// builds with one consistent style. The committed theme stays pristine; only the
// staged copy carries the config. Applied to all decks via `--theme` below — no
// deck frontmatter is ever touched.
const themeDir = join(slidesTmpDir, 'theme');
cpSync(join(engineDir, 'slidev-theme-teaman'), themeDir, { recursive: true });
writeFileSync(join(themeDir, 'styles', 'vars.css'), renderVarsCss(slidesConfig));

const logoSrc = resolveLogoSource(slidesConfig.logo, {
  teamanPublic: publicDir,
  vaultDir,
});
let logoFile = null;
if (logoSrc) {
  logoFile = `teaman-slide-logo${extname(logoSrc) || '.svg'}`;
  const deckPublic = join(slidesTmpDir, 'public');
  mkdirSync(deckPublic, { recursive: true });
  copyFileSync(logoSrc, join(deckPublic, logoFile));
} else if (slidesConfig.logo) {
  console.warn(`slides.logo "${slidesConfig.logo}" not found in vault/public — skipping slide logo.`);
}
writeFileSync(
  join(themeDir, 'logo.config.ts'),
  renderLogoConfig(logoFile, { footer: slidesConfig.footer !== false }),
);

try {
  for (const deck of decks) {
    const name = deck.id;
    const tmpDeck = join(slidesTmpDir, deck.relativePath);
    const deckOutDir = join(slidesOutDir, ...name.split('/'));

    mkdirSync(deckOutDir, { recursive: true });
    console.log(`Building deck: ${name}`);
    // Path-agnostic build: relative asset base (./) + hash routing. Slidev's
    // getSlidePath prefixes import.meta.env.BASE_URL while the router is ALSO
    // created with that base, so a sub-path base (e.g. /slides/intro/) gets
    // applied twice on in-app nav — "next" lands on /slides/intro/slides/intro/2
    // → 404. A relative base makes BASE_URL benign (assets resolve relative to
    // the page, so the deck works under any deploy prefix) and hash routing
    // keeps slide changes client-side (#/2), so deep links and refresh never hit
    // the static host's missing SPA fallback (GitLab Pages serves no _redirects).
    // Decks link in from the site by their root URL, which loads slide 1.
    // (Flags live in slidevBuildArgs, guarded by a unit test.)
    //
    // Slide navigation from deeper routes (presenter mode, the overview) needs
    // router paths that are absolute and base-less; Slidev ≥ 52.17 ships that
    // (getSlideRoutePath) — see the routing note in scripts/slides-theme.mjs.
    execFileSync('npx', slidevBuildArgs(tmpDeck, { out: deckOutDir, theme: themeDir }), {
      cwd: engineDir,
      stdio: 'inherit',
    });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(slidesTmpDir, { recursive: true, force: true });
}
