import { readdirSync, mkdirSync, existsSync, cpSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join, basename } from 'path';
import { normalizeBase } from '../src/lib/site-base.mjs';

const siteDir = fileURLToPath(new URL('..', import.meta.url));
const vaultDir = process.env.TEAMAN_VAULT ?? fileURLToPath(new URL('../../content', import.meta.url));
const outDir = process.env.TEAMAN_OUT ?? fileURLToPath(new URL('../../public', import.meta.url));
const slidesSrcDir = join(vaultDir, 'slides');
const slidesTmpDir = join(siteDir, '.slides-build');
const publicDir = join(outDir, 'slides');
const siteBase = normalizeBase(process.env.TEAMAN_BASE ?? process.env.SITE_BASE);

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
  process.exitCode = 1;
} finally {
  rmSync(slidesTmpDir, { recursive: true, force: true });
}
