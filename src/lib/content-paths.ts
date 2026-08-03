import { join } from 'path';
import { vaultDir } from './build-env.mjs';

// The vault root the site is built from, straight off the env seam — which
// falls back to the repo's bundled `example/` vault so `npm run dev` and the
// test suite work in place. See `build-env.mjs`.
export const contentRoot = vaultDir;

export const notesRoot = join(contentRoot, 'notes');
export const referencesRoot = join(contentRoot, 'references');
export const guidesRoot = join(contentRoot, 'guides');
export const slidesRoot = join(contentRoot, 'slides');
export const dailiesRoot = join(contentRoot, 'dailies');
export const decisionsRoot = join(contentRoot, 'decisions');
