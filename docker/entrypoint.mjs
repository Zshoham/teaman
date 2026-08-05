#!/usr/bin/env node
// Build-only container entrypoint. Astro cannot build directly into a bind
// mount because it renames cached files into the output directory and rename
// cannot cross filesystems. Build on the container filesystem, then copy the
// completed site into the mount with the CLI's atomic commit helpers.

import { spawn } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const cliPath = require.resolve('@zshoham/teaman/bin/teaman.mjs');
const engineDir = dirname(dirname(cliPath));
// Importing the CLI is side-effect free: it only runs its dispatcher when it is
// the process entrypoint, which here it is not.
const cli = await import(pathToFileURL(cliPath).href);

const node = process.execPath;
const argv = process.argv.slice(2);
const { command, vaultArg, opts = {} } = cli.parseArgs(argv);

// Somewhere on the container filesystem, i.e. never a bind mount.
const STAGING_ROOT = '/tmp/teaman-docker-build';

/** Run the real CLI, inheriting stdio; resolves with its exit code. */
function runCli(args) {
  return new Promise((res, rej) => {
    const child = spawn(node, [cliPath, ...args], { stdio: 'inherit' });
    child.on('error', rej);
    child.on('exit', (code, signal) => res(signal ? 1 : code ?? 0));
  });
}

/** argv without `--out <dir>` — the staging build supplies its own. */
function stripOut(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

async function build() {
  const vault = resolve(vaultArg ?? process.cwd());
  // Validate the *real* destination up front with the CLI's own guards: the
  // build itself only ever sees the staging path, so its checks would otherwise
  // never look at what we are about to overwrite in the mount.
  let out;
  try {
    out = cli.validateOutPath(opts.out ?? join(vault, 'dist'), { vault, engine: engineDir });
    cli.assertOverwritableOut(out);
  } catch (error) {
    console.error(`\x1b[31mteaman error\x1b[0m ${error.message}`);
    return 1;
  }

  const staged = join(STAGING_ROOT, 'dist');
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  mkdirSync(STAGING_ROOT, { recursive: true });

  const code = await runCli([...stripOut(argv), '--out', staged]);
  if (code !== 0) {
    rmSync(STAGING_ROOT, { recursive: true, force: true });
    return code;
  }

  // Cross-device copy into a hidden sibling of `out` (the CLI sweeps this
  // prefix on its next run), then the same rename-with-backup commit it uses.
  const pending = join(dirname(out), `.${basename(out)}.teaman-${process.pid}-${Date.now()}`);
  try {
    cli.sweepStagedDirs(out);
    mkdirSync(dirname(out), { recursive: true });
    cpSync(staged, pending, { recursive: true, verbatimSymlinks: true });
    cli.commitBuild(pending, out);
  } catch (error) {
    console.error(`\x1b[31mteaman error\x1b[0m could not write ${out}: ${error.message}`);
    return 1;
  } finally {
    if (existsSync(pending)) rmSync(pending, { recursive: true, force: true });
    rmSync(STAGING_ROOT, { recursive: true, force: true });
  }
  return 0;
}

if (command !== 'build') {
  console.error('\x1b[31mteaman error\x1b[0m the container image supports only the build command');
  process.exit(1);
}

process.exit(await build());
