// How a build lands: the safety checks on `--out`, the staging dirs the stages
// write into, the atomic swap into place, and the cleanup of what a killed
// build leaves behind. Every temp-dir name the lifecycle uses is spelled here,
// so the sweeps and the code that makes those dirs cannot drift apart.

import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync,
} from 'fs';
import { basename, dirname, join, parse, resolve } from 'path';
import { tmpdir } from 'os';
import { engineDir } from '../src/lib/build-env.mjs';
import { isInside } from '../src/lib/fs-walk.mjs';

// Astro builds a static site by emitting the prerendered pages into a server
// output dir and *renaming* their assets into the out dir. That server dir is
// the out dir when the out dir is under the cwd, and `<cwd>/.astro/` when it is
// not — and the cwd here is always the engine dir. So an out dir on another
// filesystem than the engine (a Docker bind mount, a separate disk, a network
// share) makes Astro's rename cross a device boundary and fail with EXDEV.
// Building into a staging dir inside the engine keeps that rename local, and
// only the finished site crosses over — by rename when it can, by copy when it
// cannot.
//
// The dirs, by name:
// - `<engine>/.teaman-out-<pid>-<random>/`: the staged build. Shared ground
//   (every vault built by this engine stages here), so only a dead owner's is
//   swept.
// - `<parent>/.<out>.teaman-<pid>-<time>`: the finished site, moved next to
//   `out` so the swap into place is a rename within one directory.
// - `<parent>/<out>.teaman-backup-<pid>-<time>`: the previous site, during the
//   swap.
const ENGINE_STAGING = '.teaman-out-';
const pendingPrefix = out => `.${basename(out)}.teaman-`;
const backupPrefix = out => `${basename(out)}.teaman-backup-`;
const stamp = () => `${process.pid}-${Date.now()}`;

/** Refuse an `--out` that is, or contains, something a build must not replace. */
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
// `--out <vault>/notes`): the swap renames it away and deletes it after a
// successful build. Only overwrite a path that's empty, absent, or looks like a
// previous static build (an `index.html` at its root).
function assertOverwritableOut(out) {
  if (!existsSync(out) || !statSync(out).isDirectory()) return;
  const entries = readdirSync(out);
  if (entries.length === 0 || entries.includes('index.html')) return;
  throw new Error(
    `refusing to overwrite non-empty directory that is not a previous build: ${out} (remove it or choose another --out)`,
  );
}

// Is a process still around? EPERM means it exists but belongs to someone else.
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// SIGKILL / Ctrl-C mid-build leaks a pending sibling next to `out` (often
// inside the user's vault); dying mid-swap leaks a backup sibling; either
// leaks its engine staging dir. Clear what a dead build left. (A recycled pid
// at worst skips a stale staging dir, which the next sweep gets. Concurrent
// builds from one engine are still not safe for other reasons — they share
// the `.astro` cache every build drops — but that is an older, documented
// constraint.)
function sweepLeftovers(out, engine) {
  const parent = dirname(out);
  if (existsSync(parent)) {
    const prefixes = [pendingPrefix(out), backupPrefix(out)];
    for (const name of readdirSync(parent)) {
      if (prefixes.some(prefix => name.startsWith(prefix))) rmSync(join(parent, name), { recursive: true, force: true });
    }
  }
  if (existsSync(engine)) {
    for (const name of readdirSync(engine)) {
      if (!name.startsWith(ENGINE_STAGING)) continue;
      const pid = Number.parseInt(name.slice(ENGINE_STAGING.length), 10);
      if (Number.isInteger(pid) && isRunning(pid)) continue;
      rmSync(join(engine, name), { recursive: true, force: true });
    }
  }
}

/** Move a finished build, by rename when it can and by copy across devices. */
export function moveStagedBuild(staged, dest) {
  try {
    renameSync(staged, dest);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    cpSync(staged, dest, { recursive: true, verbatimSymlinks: true });
    rmSync(staged, { recursive: true, force: true });
  }
}

// Swap `pending` (a sibling of `out`) into place; on failure the previous site
// is put back.
function commitBuild(pending, out) {
  const backup = join(dirname(out), `${backupPrefix(out)}${stamp()}`);
  let movedExisting = false;
  try {
    if (existsSync(out)) {
      renameSync(out, backup);
      movedExisting = true;
    }
    renameSync(pending, out);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting && !existsSync(out) && existsSync(backup)) renameSync(backup, out);
    throw error;
  }
}

/**
 * Build a site into `out`. Refuses an unsafe or non-build `out` before doing
 * anything; sweeps what killed builds left; then has `prepare` set up the run
 * in a fresh staging dir and work dir and runs `stages` in order, all writing
 * to that one staged dir. Only when every stage succeeds does the site cross
 * over, swapped into place atomically, so a failure leaves the previous build
 * untouched. The staging and work dirs are removed either way.
 *
 * Astro's content-layer store under `<engine>/.astro` is keyed by collection
 * name, not vault, so building a different vault from the same engine would
 * reuse the previous vault's entries: it is dropped before the first stage.
 *
 * @template Stage
 * @param {object} options
 * @param {string} options.out  as given (`--out`, or the vault's `dist`)
 * @param {string} options.vault
 * @param {Stage[]} options.stages
 * @param {(dirs: { stagedOut: string, workDir: string }) => (stage: Stage) => Promise<void>} options.prepare
 *   stages the run's inputs into `workDir` and returns the stage runner,
 *   which rejects when a stage fails
 * @param {string} [options.engine]
 * @param {string} [options.cwd]
 * @returns {Promise<string>}  the resolved `out`
 */
export async function buildSite({ out: outArg, vault, stages, prepare, engine = engineDir, cwd = process.cwd() }) {
  const out = validateOutPath(outArg, { vault, engine, cwd });
  assertOverwritableOut(out);
  sweepLeftovers(out, engine);
  mkdirSync(dirname(out), { recursive: true });

  const workDir = mkdtempSync(join(tmpdir(), 'teaman-build-'));
  const stagedRoot = mkdtempSync(join(engine, `${ENGINE_STAGING}${process.pid}-`));
  const stagedOut = join(stagedRoot, 'dist');
  const pending = join(dirname(out), `${pendingPrefix(out)}${stamp()}`);
  try {
    const runStage = prepare({ stagedOut, workDir });
    rmSync(join(engine, '.astro'), { recursive: true, force: true });
    for (const stage of stages) await runStage(stage);
    moveStagedBuild(stagedOut, pending);
    commitBuild(pending, out);
  } finally {
    for (const dir of [stagedRoot, workDir, pending]) rmSync(dir, { recursive: true, force: true });
  }
  return out;
}
