#!/usr/bin/env bun
// teaman — build an Obsidian vault into a static site with the bundled Astro
// engine. The vault carries only data: a `teaman.config.js` plus content
// directories (notes/ references/ guides/ slides/ dailies/). This CLI resolves the vault,
// loads its config, stages static assets, and runs the engine via the env seam
// (`encodeBuildEnv`, read back by every stage through `build-env.mjs`).

import { spawn } from 'child_process';
import {
  existsSync, mkdirSync, rmSync, cpSync, copyFileSync,
  readFileSync, writeFileSync, statSync, realpathSync, mkdtempSync,
} from 'fs';
import { pathToFileURL } from 'url';
import { resolve, join, dirname, basename } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import semver from 'semver';
import { encodeBuildEnv, engineDir } from '../src/lib/build-env.mjs';
import { CONTENT_DIRS } from '../src/lib/collections.mjs';
import { checkVaultConfig, enginePublicDir, resolveLogoFile } from '../src/lib/vault-config.mjs';
import { lintVault } from '../src/lib/vault-lint.mjs';
import { buildSite } from './build-output.mjs';

const require = createRequire(import.meta.url);
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

// Stage static assets into a dir handed to Astro as publicDir: the engine's
// public assets (teacup fallback) + optional vault/public + the configured logo
// (rewritten to a bare filename so the site references it by name under
// `base`). Returns the staged dir and the config the build should see: the logo
// is found wherever `resolveLogoFile` finds it and served from the site root.
export function stageStatic(vault, config, stageDir) {
  mkdirSync(stageDir, { recursive: true });
  cpSync(enginePublicDir(engineDir), stageDir, { recursive: true });

  const vaultStatic = join(vault, 'public');
  if (existsSync(vaultStatic)) cpSync(vaultStatic, stageDir, { recursive: true });

  const logoFile = resolveLogoFile(config.logo, { vaultDir: vault, engineDir });
  if (!logoFile) return { publicDir: stageDir, config };
  copyFileSync(logoFile, join(stageDir, basename(logoFile)));
  return { publicDir: stageDir, config: { ...config, logo: basename(logoFile) } };
}

function envFor(vault, config, { out, base, publicDir, slidesWorkDir } = {}) {
  return {
    ...process.env,
    ...encodeBuildEnv({
      vaultDir: vault, config, version: VERSION, outDir: out, siteBase: base, publicDir, slidesWorkDir,
    }),
  };
}

// Signals sent to the CLI alone — `kill`, a closed terminal, a process manager
// stopping it — are passed on to the stage it is running, which would
// otherwise outlive it (an orphaned dev server still holding its port). The
// CLI then ends when the stage does, so a build still cleans up after itself.
// Ctrl-C needs no forwarding: it reaches the whole foreground process group.
const FORWARDED_SIGNALS = ['SIGTERM', 'SIGHUP'];

function run(cmd, args, env) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: engineDir, env, stdio: 'inherit' });
    const forward = signal => child.kill(signal);
    for (const signal of FORWARDED_SIGNALS) process.on(signal, forward);
    const done = () => { for (const signal of FORWARDED_SIGNALS) process.off(signal, forward); };
    child.on('error', error => { done(); rej(error); });
    child.on('exit', (code, signal) => {
      done();
      if (code === 0) res();
      else rej(new Error(signal ? `${basename(cmd)} stopped by ${signal}` : `${basename(cmd)} exited with code ${code}`));
    });
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
// The four build stages, in order, as argv for the runtime: Astro renders the
// site, then the reference PDFs, the Slidev decks, and the search index land
// beside it.
const BUILD_STAGES = [
  [astroBin, 'build'],
  ...['build-references', 'build-slides', 'build-search'].map(stage => [join(engineDir, 'scripts', `${stage}.mjs`)]),
];

async function cmdBuild(vaultArg, opts) {
  const { vault, config, base } = await openVault(vaultArg, opts);

  const present = CONTENT_DIRS.filter(d => existsSync(join(vault, d)));
  if (present.length === 0) warn(`no content dirs (${CONTENT_DIRS.join('/')}) found under ${vault}`);

  const out = opts.out ?? join(vault, 'dist');
  info(`building ${c.bold(vault)} → ${c.bold(resolve(out))} ${c.dim(`(engine ${VERSION})`)}`);
  await buildSite({
    out,
    vault,
    stages: BUILD_STAGES,
    prepare: ({ stagedOut, workDir }) => {
      const staged = stageStatic(vault, config, join(workDir, 'public'));
      const env = envFor(vault, staged.config, {
        out: stagedOut, base, publicDir: staged.publicDir, slidesWorkDir: join(workDir, 'slides'),
      });
      return args => run(node, args, env);
    },
  });
  info(c.green('done.'));
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
    await run(node, [join(engineDir, 'scripts', 'build-references.mjs')],
      envFor(vault, staged.config, { out: staged.publicDir, base, publicDir: staged.publicDir }));
    // Astro auto-detaches when it detects an AI agent. Keep the server under
    // this CLI's lifetime so staged assets survive until the server stops.
    await run(node, [astroBin, 'dev', ...serverArgs(opts)], {
      ...env,
      ASTRO_DEV_BACKGROUND: '0',
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function cmdPreview(vaultArg, opts) {
  const { vault, config, base } = await openVault(vaultArg, opts, { check: false });
  const out = resolve(opts.out ?? join(vault, 'dist'));
  const env = envFor(vault, config, { out, base });
  // Supervisors such as Playwright need the preview command to stay alive.
  await run(node, [astroBin, 'preview', ...serverArgs(opts)], {
    ...env,
    ASTRO_PREVIEW_BACKGROUND: '0',
  });
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

async function cmdDoctor(vaultArg) {
  // `check: false` — the engine-range mismatch is reported below as a finding
  // rather than as a bare warning ahead of the report.
  const { vault, config, path } = await openVault(vaultArg, {}, { check: false });

  const checks = [
    validateConfig(config, { hasConfigFile: Boolean(path) }),
    lintVault(vault),
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
