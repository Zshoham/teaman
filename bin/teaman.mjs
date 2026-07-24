#!/usr/bin/env node
// teaman — build an Obsidian vault into a static site with the bundled Astro
// engine. The vault carries only data: a `teaman.config.js` plus content
// directories (notes/ guides/ slides/ dailies/). This CLI resolves the vault,
// loads its config, stages static assets, and runs the engine via the env seam
// (TEAMAN_VAULT / TEAMAN_OUT / TEAMAN_BASE / TEAMAN_CONFIG / TEAMAN_PUBLIC).

import { spawn } from 'child_process';
import {
  existsSync, mkdirSync, rmSync, cpSync, copyFileSync,
  readFileSync, writeFileSync, readdirSync, statSync, realpathSync,
  mkdtempSync, renameSync, symlinkSync,
} from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolve, join, dirname, basename, isAbsolute, parse, relative } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import semver from 'semver';

const require = createRequire(import.meta.url);
const engineDir = fileURLToPath(new URL('..', import.meta.url));
const enginePkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
const VERSION = enginePkg.version;

const CONTENT_DIRS = ['notes', 'guides', 'slides', 'dailies', 'decisions'];

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
export function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version' || a === '-v') return { command: '--version' };
    if (a === '--help' || a === '-h') return { command: 'help' };
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { opts[key] = next; i++; }
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

// Stage static assets into a dir handed to Astro as publicDir: engine defaults
// (teacup fallback) + optional vault/public + the configured logo (rewritten to
// a bare filename so the site references it by name under `base`).
function stageStatic(vault, config, stageDir) {
  mkdirSync(stageDir, { recursive: true });
  cpSync(join(engineDir, 'resources'), stageDir, { recursive: true });

  const vaultStatic = join(vault, 'public');
  if (existsSync(vaultStatic)) cpSync(vaultStatic, stageDir, { recursive: true });

  if (config.logo) {
    const logoPath = isAbsolute(config.logo) ? config.logo : join(vault, config.logo);
    if (existsSync(logoPath)) {
      const name = basename(logoPath);
      copyFileSync(logoPath, join(stageDir, name));
      config.logo = name;
    }
    // else: assume it already lives in resources/ or vault/public — leave as-is.
  }
  return stageDir;
}

function containsPath(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function validateOutPath(outArg, { vault, engine = engineDir, cwd = process.cwd() }) {
  const out = resolve(outArg);
  const forbiddenExact = [parse(out).root, vault, engine, cwd, join(vault, 'public')]
    .map(path => resolve(path));
  if (forbiddenExact.includes(out)) {
    throw new Error(`refusing unsafe output path: ${out}`);
  }
  if (containsPath(out, vault) || containsPath(out, engine)) {
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
  const vault = resolveVault(vaultArg);
  const { config } = await loadVaultConfig(vault);
  checkEngine(config);

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
  const base = opts.base ?? config.base ?? '/';
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
  const stagedOut = join(dirname(out), `.${basename(out)}.teaman-${process.pid}-${Date.now()}`);
  const publicDir = stageStatic(vault, config, join(workDir, 'public'));
  const env = {
    ...envFor(vault, config, { out: stagedOut, base, publicDir }),
    TEAMAN_SLIDES_WORK: join(workDir, 'slides'),
  };

  info(`building ${c.bold(vault)} → ${c.bold(out)} ${c.dim(`(engine ${VERSION})`)}`);
  // The content collections resolve their roots from TEAMAN_VAULT at build
  // time, but Astro's content-layer store under `.astro/` is keyed by
  // collection name, not vault. Building a different vault from the same engine
  // checkout would otherwise reuse the previous vault's cached notes/guides, so
  // drop the cache to isolate each build.
  try {
    rmSync(join(engineDir, '.astro'), { recursive: true, force: true });
    await run(node, [astroBin, 'build'], env);
    await run(node, [join(engineDir, 'scripts', 'build-slides.mjs')], env);
    await run(node, [join(engineDir, 'scripts', 'build-search.mjs')], env);
    commitBuild(stagedOut, out);
    info(c.green('done.'));
  } finally {
    rmSync(stagedOut, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function cmdDev(vaultArg, opts) {
  const vault = resolveVault(vaultArg);
  const { config } = await loadVaultConfig(vault);
  checkEngine(config);
  const workDir = mkdtempSync(join(tmpdir(), 'teaman-dev-'));
  const publicDir = stageStatic(vault, config, join(workDir, 'public'));
  const env = envFor(vault, config, { base: opts.base ?? config.base ?? '/', publicDir });
  info(`dev server for ${c.bold(vault)} ${c.dim(`(engine ${VERSION})`)}`);
  try {
    await run(node, [astroBin, 'dev', ...(opts.port ? ['--port', String(opts.port)] : [])], env);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function cmdPreview(vaultArg, opts) {
  const vault = resolveVault(vaultArg);
  const { config } = await loadVaultConfig(vault);
  const out = resolve(opts.out ?? join(vault, 'dist'));
  const env = envFor(vault, config, { out, base: opts.base ?? config.base ?? '/' });
  await run(node, [astroBin, 'preview'], env);
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
const KNOWN_KEYS = new Set(['brand', 'tagline', 'logo', 'hero', 'footerNote', 'engine', 'theme', 'base', 'slides', 'links', 'smartLinks']);
const KNOWN_HERO_KEYS = new Set(['eyebrow', 'title', 'description']);
const KNOWN_SLIDES_KEYS = new Set(['logo', 'primary', 'secondary', 'footer']);
const KNOWN_LINK_KEYS = new Set(['label', 'url', 'description', 'icon']);
const KNOWN_SMART_LINK_KEYS = new Set(['jira', 'confluence', 'gitlab']);

function knownThemeTokens() {
  try {
    const css = readFileSync(join(engineDir, 'src', 'styles', 'global.css'), 'utf8');
    const root = css.slice(css.indexOf(':root'));
    return new Set([...root.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
  } catch { return null; }
}

function walkMd(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkMd(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

async function cmdDoctor(vaultArg) {
  const vault = resolveVault(vaultArg);
  const { config, path } = await loadVaultConfig(vault);
  const problems = [];
  const warnings = [];

  // 1. config / engine
  if (config.engine && !satisfies(VERSION, config.engine)) {
    warnings.push(`engine range ${config.engine} excludes running engine ${VERSION}`);
  }
  if (path) {
    if (!config.brand) problems.push('config: missing required "brand"');
    if (config.hero && !config.hero.title) problems.push('config: hero is present but missing "title"');
    for (const k of Object.keys(config)) {
      if (!KNOWN_KEYS.has(k)) warnings.push(`config: unknown key "${k}"`);
    }
    for (const k of Object.keys(config.hero ?? {})) {
      if (!KNOWN_HERO_KEYS.has(k)) warnings.push(`config: unknown hero key "${k}"`);
    }
    for (const k of Object.keys(config.slides ?? {})) {
      if (!KNOWN_SLIDES_KEYS.has(k)) warnings.push(`config: unknown slides key "${k}"`);
    }
    if (config.links !== undefined) {
      if (!Array.isArray(config.links)) {
        problems.push('config: "links" must be an array');
      } else {
        config.links.forEach((l, i) => {
          if (!l || typeof l !== 'object') {
            problems.push(`config: links[${i}] must be an object`);
            return;
          }
          if (!l.label) problems.push(`config: links[${i}] missing required "label"`);
          if (!l.url) problems.push(`config: links[${i}] missing required "url"`);
          else if (!/^(https?:\/\/|\/|#)/i.test(String(l.url)))
            warnings.push(`config: links[${i}] url "${l.url}" doesn't look like a URL`);
          for (const k of Object.keys(l)) {
            if (!KNOWN_LINK_KEYS.has(k)) warnings.push(`config: unknown link key "${k}" (links[${i}])`);
          }
        });
      }
    }
    if (config.smartLinks !== undefined) {
      if (typeof config.smartLinks !== 'object' || Array.isArray(config.smartLinks) || !config.smartLinks) {
        problems.push('config: "smartLinks" must be an object keyed by service');
      } else {
        for (const [service, hosts] of Object.entries(config.smartLinks)) {
          if (!KNOWN_SMART_LINK_KEYS.has(service)) {
            warnings.push(`config: unknown smartLinks service "${service}"`);
            continue;
          }
          if (!Array.isArray(hosts)) {
            problems.push(`config: smartLinks.${service} must be an array of hostnames`);
            continue;
          }
          hosts.forEach((h, i) => {
            if (typeof h !== 'string' || !h.trim()) {
              problems.push(`config: smartLinks.${service}[${i}] must be a non-empty hostname`);
            } else if (!/^(\*\.)?[a-z0-9.-]+$/i.test(h.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, ''))) {
              warnings.push(`config: smartLinks.${service}[${i}] "${h}" doesn't look like a hostname`);
            }
          });
        }
      }
    }
    const tokens = knownThemeTokens();
    if (tokens && config.theme) {
      for (const t of Object.keys(config.theme)) {
        const key = t.startsWith('--') ? t : `--${t}`;
        if (!tokens.has(key)) warnings.push(`theme: unknown token "${t}"`);
      }
    }
  }

  // 2. content lint (cheap) — needs gray-matter from the engine's deps.
  let matter;
  try { matter = (await import('gray-matter')).default; } catch { /* skip fm checks */ }

  if (matter) {
    for (const file of walkMd(join(vault, 'dailies'))) {
      const { data } = matter(readFileSync(file, 'utf8'));
      // The dailies collection schema requires `date`; a YYYY-MM-DD filename
      // only supplies the URL slug, not the schema field, so the build rejects
      // a dated filename without frontmatter. Match that here.
      if (!data.date) problems.push(`dailies: ${basename(file)} needs a "date" in frontmatter`);
    }

    // The decisions collection requires `date` + a valid `status`; lineage
    // pointers should resolve to an ADR that actually exists in the vault.
    const decisionsDir = join(vault, 'decisions');
    if (existsSync(decisionsDir)) {
      const STATUSES = new Set(['accepted', 'proposed', 'superseded']);
      const files = walkMd(decisionsDir);
      const nums = new Set(
        files.map(f => (basename(f, '.md').match(/(\d+)/) ?? [])[1]).filter(Boolean),
      );
      for (const file of files) {
        const { data } = matter(readFileSync(file, 'utf8'));
        const name = basename(file);
        if (!data.date) problems.push(`decisions: ${name} needs a "date" in frontmatter`);
        if (!data.status) problems.push(`decisions: ${name} needs a "status" (accepted | proposed | superseded)`);
        else if (!STATUSES.has(data.status)) problems.push(`decisions: ${name} has invalid status "${data.status}"`);
        for (const key of ['supersedes', 'supersededBy']) {
          const ref = data[key];
          if (ref && !nums.has(String(ref))) {
            warnings.push(`decisions: ${name} ${key} points at missing ADR-${ref}`);
          }
        }
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
  // unresolved wiki-links in notes
  const noteSlugs = new Set(
    walkMd(join(vault, 'notes')).map(f => basename(f, '.md').replace(/ /g, '-').toLowerCase()),
  );
  for (const file of walkMd(join(vault, 'notes'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\[\[([^\]|#]+)/g)) {
      const target = m[1].trim().replace(/ /g, '-').toLowerCase();
      if (!noteSlugs.has(target)) warnings.push(`notes: ${basename(file)} links to missing [[${m[1].trim()}]]`);
    }
  }

  // report
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
  --port <n>       Dev server port
  -v, --version    Print engine version
  -h, --help       Show this help

[vault] defaults to the current directory.`);
}

// ── dispatch ─────────────────────────────────────────────────────────────
async function main(argv = process.argv.slice(2)) {
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
