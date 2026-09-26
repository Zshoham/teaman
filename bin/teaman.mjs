#!/usr/bin/env bun
// teaman — build an Obsidian vault into a static site with the bundled Astro
// engine. The vault carries only data: a `teaman.config.js` plus content
// directories (notes/ references/ guides/ slides/ dailies/). This CLI resolves the vault,
// loads its config, stages static assets, and runs the engine via the env seam
// (TEAMAN_VAULT / TEAMAN_OUT / TEAMAN_BASE / TEAMAN_CONFIG / TEAMAN_PUBLIC).

import { spawn } from 'child_process';
import {
  existsSync, mkdirSync, rmSync, cpSync, copyFileSync,
  readFileSync, writeFileSync, readdirSync, statSync, realpathSync,
  mkdtempSync, renameSync, symlinkSync,
} from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolve, join, dirname, basename, isAbsolute, parse, relative, sep } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import semver from 'semver';
import { discoverReferenceDocuments } from '../src/lib/reference-documents.mjs';
import { COLLECTIONS, CONTENT_DIRS, collectionFor } from '../src/lib/collections.mjs';
import { adrNum, SLUG_OVERRIDE_TYPES } from '../src/lib/entry-identity.mjs';
import { checkVaultConfig, resolveLogoFile } from '../src/lib/vault-config.mjs';
import { frontmatterProblems } from '../src/lib/frontmatter-schemas.mjs';
import { discoverDecks } from '../src/lib/discover-decks.mjs';
import matter from 'gray-matter';
import { discoverDecisions } from '../src/lib/discover-decisions.mjs';
import { createVaultIndex } from '../src/lib/vault-index.mjs';
import { isImageEmbed, wikiLinks } from '../src/lib/obsidian-markdown.mjs';
import { isInside, walkMarkdown } from '../src/lib/fs-walk.mjs';

const require = createRequire(import.meta.url);
const engineDir = fileURLToPath(new URL('..', import.meta.url));
const enginePkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
const VERSION = enginePkg.version;

// ── tiny terminal helpers ────────────────────────────────────────────────
const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};
const info = m => console.log(`${c.dim('teaman')} ${m}`);
const warn = m => console.warn(`${c.yellow('teaman warn')} ${m}`);
const fail = m => { console.error(`${c.red('teaman error')} ${m}`); process.exit(1); };

// ── arg parsing ──────────────────────────────────────────────────────────

// `--host` is the one flag whose value is optional (bare = every interface),
// which the "next token that isn't a flag is the value" rule below cannot see:
// in `teaman dev --host ./vault` the next token is the vault, not an address.
//
// The two ways to guess wrong are not equally cheap. Read a vault as a host and
// the CLI silently serves the *current* directory and hands Astro a path to
// bind; read a host as a vault and it stops on a plain "vault path is not a
// directory". So the next token is the address only when it can hardly be
// anything else — an IP, a dotted name, `localhost` — and never when it names a
// directory sitting right here. A bare `--host vault` stays the vault; a host
// that really is a single label says so with `--host=vault`.
function looksLikeHost(token) {
  const address = /^(localhost|[\w-]+(\.[\w-]+)+|[\da-fA-F:]*:[\da-fA-F:]*)$/.test(token);
  if (!address) return false;
  try { return !statSync(token).isDirectory(); } catch { return true; }
}

const OPTIONAL_VALUE_FLAGS = { host: looksLikeHost };

export function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version' || a === '-v') return { command: '--version' };
    if (a === '--help' || a === '-h') return { command: 'help' };
    if (a.startsWith('--')) {
      // `--key=value` attaches the value to the flag, which is the way to say
      // one the guesswork below would hand to the positional (`--host=vault`).
      const eq = a.indexOf('=');
      if (eq !== -1) { opts[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      const takesNext = next && !next.startsWith('--')
        && (OPTIONAL_VALUE_FLAGS[key]?.(next) ?? true);
      if (takesNext) { opts[key] = next; i++; }
      else opts[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { command: positional[0], vaultArg: positional[1], opts };
}

// ── vault + config resolution ──────────────────────────────────────────────
function resolveVault(vaultArg) {
  const vault = resolve(vaultArg ?? process.cwd());
  if (!existsSync(vault) || !statSync(vault).isDirectory()) {
    fail(`vault path is not a directory: ${vault}`);
  }
  return vault;
}

const CONFIG_NAMES = ['teaman.config.js', 'teaman.config.mjs', 'teaman.config.json'];

async function loadVaultConfig(vault) {
  const found = CONFIG_NAMES.map(n => join(vault, n)).find(existsSync);
  if (!found) {
    warn(`no ${c.bold('teaman.config.js')} in ${vault} — using engine defaults`);
    return { config: {}, path: null };
  }
  try {
    if (found.endsWith('.json')) {
      return { config: JSON.parse(readFileSync(found, 'utf8')), path: found };
    }
    const mod = await import(pathToFileURL(found).href);
    return { config: mod.default ?? mod, path: found };
  } catch (error) {
    fail(`could not load ${found}:\n  ${error.message}`);
  }
}

// Does the running engine version fall within the vault's requested `engine`
// range? Thin wrapper over semver: an empty range is permissive, and a range
// semver can't parse warns nothing rather than crying wolf.
export function satisfies(version, range) {
  if (!range) return true;
  if (semver.validRange(range, { loose: true }) === null) return true;
  return semver.satisfies(version, range, { loose: true });
}

function checkEngine(config) {
  if (config.engine && !satisfies(VERSION, config.engine)) {
    warn(`vault expects engine ${c.bold(config.engine)} but running ${c.bold(VERSION)} — see MIGRATING.md`);
  }
}

/**
 * Resolve a vault and load its config — the opening move of every command.
 * `--base` beats `config.base` beats `/`. Pass `check: false` for `doctor`,
 * which reports the engine-range mismatch itself rather than warning twice.
 */
async function openVault(vaultArg, opts = {}, { check = true } = {}) {
  const vault = resolveVault(vaultArg);
  const { config, path } = await loadVaultConfig(vault);
  if (check) checkEngine(config);
  return { vault, config, path, base: opts.base ?? config.base ?? '/' };
}

// Stage static assets into a dir handed to Astro as publicDir: engine defaults
// (teacup fallback) + optional vault/public + the configured logo (rewritten to
// a bare filename so the site references it by name under `base`).
// Returns the staged dir and the config the build should see: the logo is
// found wherever `resolveLogoFile` finds it and served from the site root.
function stageStatic(vault, config, stageDir) {
  mkdirSync(stageDir, { recursive: true });
  cpSync(join(engineDir, 'resources'), stageDir, { recursive: true });

  const vaultStatic = join(vault, 'public');
  if (existsSync(vaultStatic)) cpSync(vaultStatic, stageDir, { recursive: true });

  const logoFile = resolveLogoFile(config.logo, { vaultDir: vault, engineDir });
  if (!logoFile) return { publicDir: stageDir, config };
  copyFileSync(logoFile, join(stageDir, basename(logoFile)));
  return { publicDir: stageDir, config: { ...config, logo: basename(logoFile) } };
}

export function validateOutPath(outArg, { vault, engine = engineDir, cwd = process.cwd() }) {
  const out = resolve(outArg);
  const forbiddenExact = [parse(out).root, vault, engine, cwd, join(vault, 'public')]
    .map(path => resolve(path));
  if (forbiddenExact.includes(out)) {
    throw new Error(`refusing unsafe output path: ${out}`);
  }
  if (isInside(out, vault) || isInside(out, engine)) {
    throw new Error(`refusing output path that contains the vault or engine: ${out}`);
  }
  return out;
}

// A validated `out` can still be a directory of live user data (e.g.
// `--out <vault>/notes`): commitBuild renames it away and deletes it after a
// successful build. Only overwrite a path that's empty, absent, or looks like a
// previous static build (an `index.html` at its root).
export function assertOverwritableOut(out) {
  if (!existsSync(out) || !statSync(out).isDirectory()) return;
  const entries = readdirSync(out);
  if (entries.length === 0 || entries.includes('index.html')) return;
  throw new Error(
    `refusing to overwrite non-empty directory that is not a previous build: ${out} (remove it or choose another --out)`,
  );
}

// SIGKILL / Ctrl-C mid-build leaks a hidden staged sibling next to `out` (often
// inside the user's vault); dying between commitBuild's renames leaks a backup
// sibling. Clear any leftovers of either before starting a fresh build.
export function sweepStagedDirs(out) {
  const parent = dirname(out);
  if (!existsSync(parent)) return;
  const prefixes = [`.${basename(out)}.teaman-`, `${basename(out)}.teaman-backup-`];
  for (const name of readdirSync(parent)) {
    if (prefixes.some(p => name.startsWith(p))) rmSync(join(parent, name), { recursive: true, force: true });
  }
}

// Astro builds a static site by emitting the prerendered pages into a server
// output dir and *renaming* their assets into the out dir. That server dir is
// the out dir when the out dir is under the cwd, and `<cwd>/.astro/` when it is
// not — and the cwd here is always the engine dir. So an out dir on another
// filesystem than the engine (a Docker bind mount, a separate disk, a network
// share) makes Astro's rename cross a device boundary and fail with EXDEV.
// Building into a staging dir inside the engine keeps that rename local, and
// only the finished site crosses over — by rename when it can, by copy when it
// cannot. Those dirs are named `.teaman-out-<pid>-<random>`, for the reason
// sweepEngineStaging explains.
const STAGED_OUT_PREFIX = '.teaman-out-';
const stagedOutPrefixFor = pid => `${STAGED_OUT_PREFIX}${pid}-`;

// Is a process still around? EPERM means it exists but belongs to someone else.
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// sweepStagedDirs' counterpart for that staging dir: a killed build leaks one
// inside the engine. Unlike the staged siblings of `out`, these are shared
// ground — every vault built by this engine stages here — so a sweep must not
// touch a dir another build is filling right now. Hence the pid in the name:
// only leftovers whose owner is gone are swept. (A recycled pid at worst skips
// a stale dir, which the next sweep gets.) Concurrent builds from one engine
// are still not safe for other reasons — they share the `.astro` cache this
// drops on every build — but that is an older, documented constraint.
export function sweepEngineStaging(dir = engineDir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(STAGED_OUT_PREFIX)) continue;
    const pid = Number.parseInt(name.slice(STAGED_OUT_PREFIX.length), 10);
    if (Number.isInteger(pid) && isRunning(pid)) continue;
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

export function moveStagedBuild(staged, dest) {
  try {
    renameSync(staged, dest);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    cpSync(staged, dest, { recursive: true, verbatimSymlinks: true });
    rmSync(staged, { recursive: true, force: true });
  }
}

export function commitBuild(stagedOut, out) {
  const backup = `${out}.teaman-backup-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    if (existsSync(out)) {
      renameSync(out, backup);
      movedExisting = true;
    }
    renameSync(stagedOut, out);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting && !existsSync(out) && existsSync(backup)) renameSync(backup, out);
    throw error;
  }
}

function envFor(vault, config, { out, base, publicDir } = {}) {
  return {
    ...process.env,
    TEAMAN_VAULT: vault,
    TEAMAN_CONFIG: JSON.stringify(config),
    TEAMAN_VERSION: VERSION,
    ...(out ? { TEAMAN_OUT: out } : {}),
    ...(base ? { TEAMAN_BASE: base } : {}),
    ...(publicDir ? { TEAMAN_PUBLIC: publicDir } : {}),
  };
}

function run(cmd, args, env) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: engineDir, env, stdio: 'inherit' });
    child.on('error', rej);
    child.on('exit', code => code === 0 ? res() : rej(new Error(`${basename(cmd)} exited with code ${code}`)));
  });
}

// Resolve Astro's own JS entry rather than a `.bin` shim: require.resolve walks
// node_modules from the engine outward, so it finds Astro whether deps are
// nested under node_modules/teaman or hoisted to the consumer's root. We run
// the resolved file through node so there's no dependence on a generated bin.
const node = process.execPath;
const astroBin = (() => {
  const pkgPath = require.resolve('astro/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.astro;
  if (!binRel) fail('could not locate the astro bin in its package.json');
  return join(dirname(pkgPath), binRel);
})();

// ── commands ───────────────────────────────────────────────────────────────
async function cmdBuild(vaultArg, opts) {
  const { vault, config, base } = await openVault(vaultArg, opts);

  const present = CONTENT_DIRS.filter(d => existsSync(join(vault, d)));
  if (present.length === 0) warn(`no content dirs (${CONTENT_DIRS.join('/')}) found under ${vault}`);

  let out;
  try {
    out = validateOutPath(opts.out ?? join(vault, 'dist'), { vault });
    assertOverwritableOut(out);
  } catch (error) {
    fail(error.message);
  }
  sweepStagedDirs(out);
  sweepEngineStaging();
  mkdirSync(dirname(out), { recursive: true });
  const workDir = mkdtempSync(join(tmpdir(), 'teaman-build-'));
  // Slidev, run from the temp work dir, walks up to find its deps, so the work
  // dir needs a node_modules. `join(engineDir, 'node_modules')` isn't enough:
  // when the engine is installed as a dependency its deps may be hoisted above
  // engineDir, so resolve through an actual dependency to reach the real root.
  // 'junction' works unprivileged on Windows; on POSIX Node treats an absolute
  // junction target as a normal dir symlink.
  const dependencyRoot = dirname(dirname(dirname(require.resolve('@slidev/cli/package.json'))));
  symlinkSync(dependencyRoot, join(workDir, 'node_modules'), 'junction');
  const stagedRoot = mkdtempSync(join(engineDir, stagedOutPrefixFor(process.pid)));
  const stagedOut = join(stagedRoot, 'dist');
  const staged = stageStatic(vault, config, join(workDir, 'public'));
  const env = {
    ...envFor(vault, staged.config, { out: stagedOut, base, publicDir: staged.publicDir }),
    TEAMAN_SLIDES_WORK: join(workDir, 'slides'),
  };

  const pending = join(dirname(out), `.${basename(out)}.teaman-${process.pid}-${Date.now()}`);

  info(`building ${c.bold(vault)} → ${c.bold(out)} ${c.dim(`(engine ${VERSION})`)}`);
  // The content collections resolve their roots from TEAMAN_VAULT at build
  // time, but Astro's content-layer store under `.astro/` is keyed by
  // collection name, not vault. Building a different vault from the same engine
  // checkout would otherwise reuse the previous vault's cached notes/references/guides, so
  // drop the cache to isolate each build.
  try {
    rmSync(join(engineDir, '.astro'), { recursive: true, force: true });
    await run(node, [astroBin, 'build'], env);
    await run(node, [join(engineDir, 'scripts', 'build-references.mjs')], env);
    await run(node, [join(engineDir, 'scripts', 'build-slides.mjs')], env);
    await run(node, [join(engineDir, 'scripts', 'build-search.mjs')], env);
    // Land the finished site next to `out` first, so the swap into place stays
    // a rename within one directory: atomic, and a failure leaves the previous
    // build untouched.
    moveStagedBuild(stagedOut, pending);
    commitBuild(pending, out);
    info(c.green('done.'));
  } finally {
    rmSync(stagedRoot, { recursive: true, force: true });
    rmSync(pending, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Astro flags shared by `dev` and `preview`. `--host` is what makes either
 * usable from outside the machine running it — a container, a VM, a phone on
 * the same network; bare `--host` means every interface, `--host <addr>` one.
 */
export function serverArgs(opts = {}) {
  const args = [];
  if (opts.port) args.push('--port', String(opts.port));
  if (opts.host === true) args.push('--host');
  else if (opts.host) args.push('--host', String(opts.host));
  return args;
}

async function cmdDev(vaultArg, opts) {
  const { vault, config, base } = await openVault(vaultArg, opts);
  const workDir = mkdtempSync(join(tmpdir(), 'teaman-dev-'));
  const staged = stageStatic(vault, config, join(workDir, 'public'));
  const env = envFor(vault, staged.config, { base, publicDir: staged.publicDir });
  info(`dev server for ${c.bold(vault)} ${c.dim(`(engine ${VERSION})`)}`);
  try {
    // PDFs are build artifacts rather than authored public files. Render them
    // into the staged public dir before Astro starts so download links work in
    // the local dev loop as well as in a production build.
    await run(node, [join(engineDir, 'scripts', 'build-references.mjs')], {
      ...env,
      TEAMAN_OUT: staged.publicDir,
    });
    await run(node, [astroBin, 'dev', ...serverArgs(opts)], env);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function cmdPreview(vaultArg, opts) {
  const { vault, config, base } = await openVault(vaultArg, opts, { check: false });
  const out = resolve(opts.out ?? join(vault, 'dist'));
  const env = envFor(vault, config, { out, base });
  await run(node, [astroBin, 'preview', ...serverArgs(opts)], env);
}

const STARTER_CONFIG = `// teaman vault config. Pure data — no functions (it is serialized to the
// engine). See the engine README for the full SiteConfig shape and theme tokens.
export default {
  engine: '^${VERSION}',
  brand: 'my.vault',
  tagline: 'a working garden',
  logo: null, // e.g. 'assets/logo.svg' (relative to this vault)
  // theme: { '--primary': 'oklch(0.67 0.14 250)', '--radius': '0.5rem' },
  // slides: { logo: 'logo.svg', primary: 'oklch(0.62 0.15 48)', secondary: 'oklch(0.58 0.05 196)', footer: true },
};
`;

function cmdInit(vaultArg) {
  const vault = resolve(vaultArg ?? process.cwd());
  mkdirSync(vault, { recursive: true });
  for (const d of CONTENT_DIRS) mkdirSync(join(vault, d), { recursive: true });
  // Scaffold .mjs, not .js: the starter uses `export default`, and a bare .js
  // is loaded with the consumer project's package `type`. In a default/
  // CommonJS project that would make the next `teaman doctor`/`build` choke on
  // `export`. The .mjs extension forces ESM regardless of the host project.
  const cfg = join(vault, 'teaman.config.mjs');
  if (existsSync(cfg)) {
    warn(`${cfg} already exists — left untouched`);
  } else {
    writeFileSync(cfg, STARTER_CONFIG);
    info(`wrote ${c.bold(cfg)}`);
  }
  info(`scaffolded ${c.bold(vault)} — add notes and run ${c.bold('teaman dev')}`);
}

// ── doctor: validate config + lint content without a full build ──────────────
function knownThemeTokens() {
  try {
    const css = readFileSync(join(engineDir, 'src', 'styles', 'global.css'), 'utf8');
    const root = css.slice(css.indexOf(':root'));
    return new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
  } catch { return null; }
}

/**
 * Validate a loaded vault config. Pure: takes the config and whether a config
 * file was actually found (a vault with none runs on engine defaults, so its
 * "missing brand" is not a problem), and returns findings rather than printing.
 *
 * @param {object} config
 * @param {{ hasConfigFile: boolean, version?: string, themeTokens?: Set<string>|null }} context
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function validateConfig(config, { hasConfigFile, version = VERSION, themeTokens }) {
  const problems = [];
  const warnings = [];

  if (config.engine && !satisfies(version, config.engine)) {
    warnings.push(`engine range ${config.engine} excludes running engine ${version}`);
  }
  if (!hasConfigFile) return { problems, warnings };

  const checked = checkVaultConfig(config, {
    themeTokens: themeTokens === undefined ? knownThemeTokens() : themeTokens,
  });
  problems.push(...checked.problems);
  warnings.push(...checked.warnings);
  return { problems, warnings };
}

/**
 * Lint a vault's content against what the collection schemas and loaders will
 * demand at build time, without building. Returns findings rather than printing.
 *
 * @param {string} vault
 * @returns {Promise<{ problems: string[], warnings: string[] }>}
 */
/** A file's frontmatter, or `{}` when it has none or it does not parse. */
function frontmatterOr(source) {
  try { return matter(source).data; } catch { return {}; }
}

export async function lintContent(vault) {
  const problems = [];
  const warnings = [];

  // Frontmatter, validated by the same schemas the content collections use
  // (frontmatter-schemas.mjs), so passing here means the build accepts it.
  const checkFrontmatter = (dir, root, file, kind, data) => {
    const where = `${dir}: ${relative(root, file).split(sep).join('/')}`;
    for (const problem of frontmatterProblems(kind, data)) problems.push(`${where}: ${problem}`);
  };
  const frontmatterOf = (dir, root, file) => {
    try {
      return matter(readFileSync(file, 'utf8')).data;
    } catch (error) {
      problems.push(`${dir}: ${relative(root, file).split(sep).join('/')}: frontmatter is not valid YAML (${String(error.message).split('\n')[0]})`);
      return null;
    }
  };
  for (const [type, kindOf] of [
    ['note', () => 'note'],
    ['daily', () => 'daily'],
    ['decision', () => 'decision'],
    ['guide', file => (basename(file).toLowerCase() === 'summary.md' ? 'guideSummary' : 'guideChapter')],
  ]) {
    const { dir } = collectionFor(type);
    const root = join(vault, dir);
    for (const file of walkMarkdown(root)) {
      const data = frontmatterOf(dir, root, file);
      if (data) checkFrontmatter(dir, root, file, kindOf(file), data);
    }
  }
  // Decks and references reach their collections through the engine's own
  // discovery, so validate what it hands over.
  const slidesRoot = join(vault, 'slides');
  for (const deck of discoverDecks(slidesRoot)) checkFrontmatter('slides', slidesRoot, deck.path, 'deck', deck.data);
  const referencesRoot = join(vault, 'references');
  for (const document of discoverReferenceDocuments(referencesRoot)) {
    if (!document.error) checkFrontmatter('references', referencesRoot, document.sourcePath, 'reference', document.data);
  }

  // Lineage pointers should resolve to an ADR that exists in the vault.
  const records = discoverDecisions(join(vault, 'decisions'));
  const nums = new Set(records.map(record => record.num));
  for (const { sourcePath, data } of records) {
    for (const key of ['supersedes', 'supersededBy']) {
      const ref = data[key];
      if (typeof ref === 'string' && ref && !nums.has(adrNum(ref))) {
        warnings.push(`decisions: ${basename(sourcePath)} ${key} points at missing ${ref}`);
      }
    }
  }

  const guidesDir = join(vault, 'guides');
  if (existsSync(guidesDir)) {
    for (const d of readdirSync(guidesDir, { withFileTypes: true })) {
      if (d.isDirectory() && !existsSync(join(guidesDir, d.name, 'SUMMARY.md'))) {
        problems.push(`guides: ${d.name}/ has no SUMMARY.md (chapter index)`);
      }
    }
  }

  const referencesDir = join(vault, 'references');
  if (existsSync(referencesDir)) {
    for (const document of discoverReferenceDocuments(referencesDir)) {
      if (document.error) {
        problems.push(`references: ${document.error}`);
        continue;
      }
      if (document.kind !== 'book') continue;
      if (document.chapters.length === 0) {
        problems.push(`references: ${document.id}/SUMMARY.md lists no Markdown chapters`);
      }
      for (const chapter of document.missing) {
        problems.push(`references: ${document.id}/SUMMARY.md points at missing chapter ${chapter}`);
      }
      for (const chapter of document.invalid) {
        problems.push(`references: ${document.id}/SUMMARY.md points outside its directory (${chapter})`);
      }
    }
  }

  // Wiki-links, resolved exactly as the site resolves them. Decks are Slidev,
  // not the site's Markdown pipeline, so their links are never rendered.
  const index = createVaultIndex(vault);
  for (const { type, dir } of COLLECTIONS.filter(c => c.type !== 'slides')) {
    const root = join(vault, dir);
    for (const file of walkMarkdown(root)) {
      const where = `${dir}: ${relative(root, file).split(sep).join('/')}`;
      const source = readFileSync(file, 'utf8');
      if (!SLUG_OVERRIDE_TYPES.has(type) && frontmatterOr(source).slug) {
        warnings.push(`${where} sets "slug", which has no effect on ${dir}`);
      }
      // Parsed with the dialect the PDF and Confluence render with, so code
      // is never linted. An embed must be an image the vault has: every
      // renderer fails the build on a note embed or a missing image.
      for (const { target, embed } of wikiLinks(source)) {
        if (embed) {
          if (!isImageEmbed(target)) {
            problems.push(`${where} embeds ![[${target}]]: note embeds are not supported; link it with [[${target}]]`);
          } else if (!index.resolveAttachment(target, file)) {
            problems.push(`${where} embeds missing image ![[${target}]]`);
          }
          continue;
        }
        const link = `[[${target}]]`;
        const resolution = index.resolve(target, file);
        if (!resolution) {
          warnings.push(`${where} links to missing ${link}`);
          continue;
        }
        const { entry, via, fragment, alternatives } = resolution;
        if (fragment) {
          warnings.push(`${where} ${link}: heading links are not supported; linking the page`);
        }
        if (via === 'slug') {
          warnings.push(`${where} ${link} only matches ${entry.path} by slug; Obsidian will not resolve it`);
        }
        if (alternatives.length > 0) {
          warnings.push(`${where} ${link} matches ${alternatives.length + 1} pages; linking ${entry.path} (qualify it as [[${entry.path}]])`);
        }
      }
    }
  }

  return { problems, warnings };
}

async function cmdDoctor(vaultArg) {
  // `check: false` — the engine-range mismatch is reported below as a finding
  // rather than as a bare warning ahead of the report.
  const { vault, config, path } = await openVault(vaultArg, {}, { check: false });

  const checks = [
    validateConfig(config, { hasConfigFile: Boolean(path) }),
    await lintContent(vault),
  ];
  const problems = checks.flatMap(check => check.problems);
  const warnings = checks.flatMap(check => check.warnings);

  info(`doctor: ${c.bold(vault)} ${c.dim(`(engine ${VERSION})`)}`);
  warnings.forEach(w => warn(w));
  problems.forEach(p => console.error(`${c.red('✗')} ${p}`));
  if (problems.length) {
    console.error(c.red(`\n${problems.length} problem(s), ${warnings.length} warning(s)`));
    process.exit(1);
  }
  info(c.green(`ok — ${warnings.length} warning(s), 0 problems`));
}

function help() {
  console.log(`teaman ${VERSION} — static site generator for Obsidian vaults

Usage: teaman <command> [vault] [options]

Commands:
  build [vault]    Build the vault into a static site   (default out: <vault>/dist)
  dev [vault]      Start the live dev server
  preview [vault]  Preview a previously built site
  init [vault]     Scaffold teaman.config.js + content dirs
  doctor [vault]   Validate config and lint content without building
  sync-confluence  Sync vault markdown to Confluence (see --help for its flags)

Options:
  --out <dir>      Output directory (build/preview)
  --base <path>    Base URL path (e.g. /my-site/)
  --port <n>       Dev/preview server port
  --host [addr]    Bind the dev/preview server to a network address
                   (bare --host is 0.0.0.0 — e.g. inside a container;
                   a single-label host needs --host=<name>)
  -v, --version    Print engine version
  -h, --help       Show this help

[vault] defaults to the current directory.`);
}

// ── dispatch ─────────────────────────────────────────────────────────────
async function main(argv = process.argv.slice(2)) {
  // Bun is the one runtime the engine is built and tested on (every stage runs
  // as `process.execPath`, and the single-file binary is Bun), so say so up
  // front rather than let an untested runtime fail somewhere mid-build.
  if (!process.versions.bun) {
    fail('teaman runs on Bun (https://bun.sh) — run it with `bun` or `bunx @zshoham/teaman`, or use the single-file binary');
  }
  // sync-confluence delegates wholesale to scripts/sync-confluence.mjs — it has
  // its own parser (util.parseArgs), CONFLUENCE_* env fallbacks, and --help. We
  // intercept before parseArgs so every flag (including -h/--help and repeated
  // --roots) passes through untouched; the script wants --content-dir <vault>.
  if (argv[0] === 'sync-confluence') {
    const script = join(engineDir, 'scripts', 'sync-confluence.mjs');
    const child = spawn(node, [script, ...argv.slice(1)], { cwd: engineDir, env: process.env, stdio: 'inherit' });
    // The script prints its own errors and sets an exit code; mirror it rather
    // than re-wrapping (no redundant "node exited with code 1" on top).
    child.on('error', error => fail(error.message));
    child.on('exit', code => { process.exitCode = code ?? 1; });
    return;
  }

  const { command, vaultArg, opts = {} } = parseArgs(argv);
  try {
    switch (command) {
      case 'build': await cmdBuild(vaultArg, opts); break;
      case 'dev': await cmdDev(vaultArg, opts); break;
      case 'preview': await cmdPreview(vaultArg, opts); break;
      case 'init': cmdInit(vaultArg); break;
      case 'doctor': await cmdDoctor(vaultArg); break;
      case '--version': console.log(VERSION); break;
      case 'help': case undefined: help(); break;
      default: fail(`unknown command "${command}" — run \`teaman --help\``);
    }
  } catch (error) {
    fail(error.message);
  }
}

// Run only when executed as the entrypoint, not when imported by tests. Node
// resolves a module's real path, so compare against the realpath of argv[1]
// (which may be a symlinked bin shim after a global/npm install).
function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) await main();
