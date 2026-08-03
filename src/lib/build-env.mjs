/**
 * The env seam, resolved once.
 *
 * The CLI (`bin/teaman.mjs`) never edits engine files to point at a vault: it
 * spawns Astro and the build scripts with `TEAMAN_*` env vars. Every engine
 * entry point has to read those vars *and* fall back to the bundled `example/`
 * → `public/` when they are unset, which is what makes the plain `npm` scripts
 * and the test suite work in place.
 *
 * That fallback used to be hand-mirrored in `astro.config.mjs`, all three
 * `scripts/*.mjs`, and `content-paths.ts`. This module is the single copy —
 * import from here rather than reaching for `process.env` again.
 *
 * Values are computed at module load. Tests that need a different vault must
 * `vi.resetModules()` after setting the env, the same way `content-paths` has
 * always been exercised.
 */
import { isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { normalizeBase } from './site-base.mjs';

/** The engine checkout / installed package root. */
export const engineDir = fileURLToPath(new URL('../..', import.meta.url));

function fromEnv(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(value);
}

/** Vault root — the content the site is built from. */
export const vaultDir = fromEnv(process.env.TEAMAN_VAULT, join(engineDir, 'example'));

/** Where the built site is written. */
export const outDir = fromEnv(process.env.TEAMAN_OUT, join(engineDir, 'public'));

/**
 * Static assets handed to Astro as `publicDir`. Under the CLI this is the
 * staged dir holding engine `resources/` + the vault's own `public/`; without
 * it, engine `resources/` alone.
 */
export const publicDir = fromEnv(process.env.TEAMAN_PUBLIC, join(engineDir, 'resources'));

/** Base URL path, normalized to a single leading + trailing slash. */
export const siteBase = normalizeBase(process.env.TEAMAN_BASE ?? process.env.SITE_BASE);

/**
 * The vault's `teaman.config.js`, serialized by the CLI. Absent (plain
 * `npm run dev`, the tests) means "engine defaults". Malformed does too — the
 * markdown pipeline, the slides build and the site config must not fail over a
 * bad value here, since `teaman doctor` is what reports config problems — but
 * it warns, because a config that silently evaporates is worse than a noisy one.
 */
export const teamanConfig = (() => {
  const raw = process.env.TEAMAN_CONFIG;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[teaman] could not parse TEAMAN_CONFIG, using defaults:', error);
    return {};
  }
})();
