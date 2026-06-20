import { isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// The vault root the site is built from. The CLI (`teaman build`) sets
// `TEAMAN_VAULT` to the target vault; when unset we fall back to the repo's
// bundled `content/` vault so `npm run dev` and the test suite work in place.
const fallbackRoot = fileURLToPath(new URL('../../../content', import.meta.url));

const fromEnv = process.env.TEAMAN_VAULT;
export const contentRoot = fromEnv
  ? (isAbsolute(fromEnv) ? fromEnv : resolve(fromEnv))
  : fallbackRoot;

export const notesRoot = join(contentRoot, 'notes');
export const guidesRoot = join(contentRoot, 'guides');
export const slidesRoot = join(contentRoot, 'slides');
export const dailiesRoot = join(contentRoot, 'dailies');
export const decisionsRoot = join(contentRoot, 'decisions');
