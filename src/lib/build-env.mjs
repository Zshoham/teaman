/**
 * The env seam, resolved once.
 *
 * The CLI (`bin/teaman.mjs`) never edits engine files to point at a vault: it
 * spawns Astro and the build scripts with `TEAMAN_*` env vars, written by
 * `encodeBuildEnv` and read back by `decodeBuildEnv` — the one place a var
 * is named on either side. Every engine
 * entry point has to read those vars *and* fall back to the bundled `example/`
 * → `public/` when they are unset, which is what makes the plain package scripts
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
import { readFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { normalizeBase } from './site-base.mjs';
import { enginePublicDir, mergeConfig } from './vault-config.mjs';

/** The engine checkout / installed package root. */
export const engineDir = fileURLToPath(new URL('../..', import.meta.url));

/**
 * What a build stage is told, as the CLI hands it over: the inverse of
 * `decodeBuildEnv`. Only what is given is set, so a stage falls back for the
 * rest.
 *
 * @param {object} settings
 * @param {string} settings.vaultDir
 * @param {object} settings.config  the vault config, as loaded (plain data)
 * @param {string} [settings.version]  the CLI's engine version
 * @param {string} [settings.outDir]
 * @param {string} [settings.siteBase]
 * @param {string} [settings.publicDir]
 * @param {string} [settings.slidesWorkDir]
 * @returns {Record<string, string>}
 */
export function encodeBuildEnv({ vaultDir, config, version, outDir, siteBase, publicDir, slidesWorkDir }) {
  const env = { TEAMAN_VAULT: vaultDir, TEAMAN_CONFIG: JSON.stringify(config) };
  if (version) env.TEAMAN_VERSION = version;
  if (outDir) env.TEAMAN_OUT = outDir;
  if (siteBase) env.TEAMAN_BASE = siteBase;
  if (publicDir) env.TEAMAN_PUBLIC = publicDir;
  if (slidesWorkDir) env.TEAMAN_SLIDES_WORK = slidesWorkDir;
  return env;
}

function fromEnv(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(value);
}

/**
 * Read the seam from `env`, falling back to the bundled `example/` vault and
 * the engine's own dirs for whatever is unset.
 *
 * The site config is the vault's `teaman.config.js` (serialized by the CLI)
 * merged over the engine defaults, so every consumer sees the same complete
 * shape. Absent (plain `bun run dev`, the tests) means "engine defaults".
 * Malformed does too — the markdown pipeline, the slides build and the site
 * must not fail over a bad value here, since `teaman doctor` is what reports
 * config problems — but it warns, because a config that silently evaporates is
 * worse than a noisy one.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} [engine]
 */
export function decodeBuildEnv(env, engine = engineDir) {
  let config = {};
  if (env.TEAMAN_CONFIG) {
    try {
      config = JSON.parse(env.TEAMAN_CONFIG);
    } catch (error) {
      console.warn('[teaman] could not parse TEAMAN_CONFIG, using defaults:', error);
    }
  }
  return {
    vaultDir: fromEnv(env.TEAMAN_VAULT, join(engine, 'example')),
    outDir: fromEnv(env.TEAMAN_OUT, join(engine, 'public')),
    publicDir: fromEnv(env.TEAMAN_PUBLIC, enginePublicDir(engine)),
    siteBase: normalizeBase(env.TEAMAN_BASE ?? env.SITE_BASE),
    siteConfig: mergeConfig(config),
    engineVersion: env.TEAMAN_VERSION
      ?? JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')).version,
    slidesWorkDir: fromEnv(env.TEAMAN_SLIDES_WORK, join(engine, '.slides-build')),
  };
}

const seam = decodeBuildEnv(process.env);

/** Vault root — the content the site is built from. */
export const vaultDir = seam.vaultDir;

/** Where the built site is written. */
export const outDir = seam.outDir;

/**
 * Static assets handed to Astro as `publicDir`. Under the CLI this is the
 * staged dir holding the engine's `resources/public/` + the vault's own
 * `public/`; without it, the engine's `resources/public/` alone.
 */
export const publicDir = seam.publicDir;

/** Base URL path, normalized to a single leading + trailing slash. */
export const siteBase = seam.siteBase;

/** The vault's config merged over the engine defaults (see `decodeBuildEnv`). */
export const siteConfig = seam.siteConfig;

/**
 * The engine version, stamped into built pages: the CLI's own version when it
 * spawned this build, else the engine's package.json.
 */
export const engineVersion = seam.engineVersion;

/**
 * Where the slides build stages decks for Slidev: a per-build temp dir under
 * the CLI, else `<engine>/.slides-build/`.
 */
export const slidesWorkDir = seam.slidesWorkDir;
