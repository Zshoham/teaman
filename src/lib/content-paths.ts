import { join } from 'path';
import { vaultDir } from './build-env.mjs';
import { collectionFor, type EntryType } from './collections.mjs';

// The vault root the site is built from, straight off the env seam — which
// falls back to the repo's bundled `example/` vault so `npm run dev` and the
// test suite work in place. See `build-env.mjs`.
export const contentRoot = vaultDir;

/** Absolute path to one content type's directory in the vault. */
export function rootFor(type: EntryType): string {
  return join(contentRoot, collectionFor(type).dir);
}

export const notesRoot = rootFor('note');
export const referencesRoot = rootFor('reference');
export const guidesRoot = rootFor('guide');
export const slidesRoot = rootFor('slides');
export const dailiesRoot = rootFor('daily');
export const decisionsRoot = rootFor('decision');
