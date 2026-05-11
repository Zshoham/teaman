import { readdirSync, mkdirSync, existsSync, cpSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join, basename } from 'path';

const siteDir = fileURLToPath(new URL('..', import.meta.url));
const slidesSrcDir = fileURLToPath(new URL('../../content/slides', import.meta.url));
const slidesTmpDir = join(siteDir, '.slides-build');
const publicDir = fileURLToPath(new URL('../../public/slides', import.meta.url));
const siteBase = process.env.SITE_BASE ?? '/';

if (!existsSync(slidesSrcDir)) {
  console.log('No slides directory, skipping.');
  process.exit(0);
}

const decks = readdirSync(slidesSrcDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));

if (decks.length === 0) {
  console.log('No slide decks found.');
  process.exit(0);
}

// Slidev resolves themes from the slide file's directory (slidevjs/slidev#1975).
// Copy the vault's slides into site/ so slidev can find site/node_modules by
// walking up the directory tree.
rmSync(slidesTmpDir, { recursive: true, force: true });
cpSync(slidesSrcDir, slidesTmpDir, { recursive: true });

try {
  for (const deck of decks) {
    const name = basename(deck, '.md');
    const tmpDeck = join(slidesTmpDir, deck);
    const outDir = join(publicDir, name);
    const deckBase = `${siteBase}slides/${name}/`;

    mkdirSync(outDir, { recursive: true });
    console.log(`Building deck: ${name}`);
    execFileSync('npx', [
      'slidev', 'build', tmpDeck,
      '--base', deckBase,
      '--out', outDir,
    ], {
      cwd: siteDir,
      stdio: 'inherit',
    });
  }
} catch (error) {
  console.error(error);
  rmSync(slidesTmpDir, { recursive: true, force: true });
  process.exit(1);
}
