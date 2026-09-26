// Build the single-file teaman binary: one executable holding the Bun runtime,
// the engine, and every dependency it needs, so a machine with no Bun, Node or
// npm can init, build, dev, doctor and sync a vault.
//
//   bun scripts/build-binary.mjs [--target bun-<os>-<arch>] [--out <file>] [--level <1-22>]
//
// The engine rides along as one embedded file — the `bun pm pack` tarball
// installed with its production dependencies, packed (engine-archive.mjs) and
// zstd-compressed — behind bin/teaman-binary.mjs, which unpacks and runs it.
//
// Any target builds from any host: Bun cross-compiles the runtime, and the
// native dependencies (typst, pagefind, lightningcss…) are installed for the
// target's OS and CPU. Install scripts are skipped; the only one in the tree
// is esbuild's optional host-binary check, which a cross install must not run.

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join, relative, resolve, sep } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { constants as zlibConstants, createZstdCompress } from 'zlib';
import { archiveEntries } from './engine-archive.mjs';

const engineDir = fileURLToPath(new URL('..', import.meta.url));
const enginePkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
const ENTRY = `node_modules/${enginePkg.name}/bin/teaman.mjs`;

// Bun names Windows `windows`; npm's `os` field (what `bun install --os`
// matches optional dependencies on) calls it `win32`.
const TARGETS = {
  'bun-linux-x64': { os: 'linux', cpu: 'x64' },
  'bun-linux-arm64': { os: 'linux', cpu: 'arm64' },
  'bun-darwin-x64': { os: 'darwin', cpu: 'x64' },
  'bun-darwin-arm64': { os: 'darwin', cpu: 'arm64' },
  'bun-windows-x64': { os: 'win32', cpu: 'x64' },
};

/** The binary's file name for a target: `teaman-<os>-<arch>[.exe]`. */
export function binaryName(target) {
  const platform = TARGETS[target];
  if (!platform) throw new Error(`unsupported target ${target} (one of: ${Object.keys(TARGETS).join(', ')})`);
  return `teaman-${platform.os}-${platform.cpu}${platform.os === 'win32' ? '.exe' : ''}`;
}

const hostTarget = () => `bun-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function step(message) {
  console.log(`\n\x1b[1m▸ ${message}\x1b[0m`);
}

/** Install the engine as a consumer gets it — pack, then install the tarball. */
function installEngine(workDir, { os, cpu }) {
  step(`Packing the engine and installing its production dependencies for ${os}-${cpu}`);
  // --quiet prints just the tarball's name.
  const packed = execFileSync('bun', ['pm', 'pack', '--quiet', '--destination', workDir], {
    cwd: engineDir,
    encoding: 'utf8',
  }).trim().split('\n').pop();
  const stage = join(workDir, 'engine');
  mkdirSync(stage);
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'teaman-binary', private: true }));
  run('bun', ['add', join(workDir, basename(packed)), '--production', '--ignore-scripts', '--no-save', `--os=${os}`, `--cpu=${cpu}`], { cwd: stage });
  rmSync(join(stage, 'node_modules', '.cache'), { recursive: true, force: true });
  pruneMuslPackages(join(stage, 'node_modules'));
  return stage;
}

/**
 * Delete the musl-only native packages from an installed tree. `bun install
 * --os/--cpu` has no libc filter, so a Linux install carries both the glibc
 * and musl build of every native dependency — tens of MB each — while Bun's
 * Linux targets are glibc builds.
 * @returns {string[]} the removed package dirs, relative to `nodeModules`
 */
export function pruneMuslPackages(nodeModules) {
  const removed = [];
  const visit = dir => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const path = join(dir, name);
      if (name.startsWith('@')) { visit(path); continue; }
      let libc;
      try { ({ libc } = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))); } catch { /* not a package */ }
      if (Array.isArray(libc) && !libc.includes('glibc')) {
        rmSync(path, { recursive: true, force: true });
        removed.push(relative(nodeModules, path).split(sep).join('/'));
      } else if (existsSync(join(path, 'node_modules'))) {
        visit(join(path, 'node_modules'));
      }
    }
  };
  visit(nodeModules);
  return removed;
}

async function compress(stage, payload, level) {
  step(`Compressing the engine (zstd level ${level})`);
  await pipeline(
    Readable.from(archiveEntries(stage)),
    createZstdCompress({ params: { [zlibConstants.ZSTD_c_compressionLevel]: level } }),
    createWriteStream(payload),
  );
  return createHash('sha256').update(readFileSync(payload)).digest('hex').slice(0, 12);
}

/** Compile the launcher with the payload and its manifest embedded. */
function compile({ workDir, target, manifest, out }) {
  step(`Compiling ${target} → ${out}`);
  const entry = join(workDir, 'entry.mjs');
  writeFileSync(entry, [
    `import payload from './engine.zst' with { type: 'file' };`,
    `import { launch } from ${JSON.stringify(join(engineDir, 'bin', 'teaman-binary.mjs'))};`,
    `await launch({ payload, manifest: ${JSON.stringify(manifest)} });`,
    '',
  ].join('\n'));
  mkdirSync(resolve(out, '..'), { recursive: true });
  run('bun', ['build', '--compile', `--target=${target}`, entry, '--outfile', out]);
}

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', default: hostTarget() },
      out: { type: 'string' },
      level: { type: 'string', default: '12' },
    },
  });
  const { target } = values;
  const name = binaryName(target); // also rejects an unknown target up front
  const out = resolve(values.out ?? join(engineDir, 'dist-bin', name));

  const workDir = mkdtempSync(join(tmpdir(), 'teaman-binary-'));
  try {
    const stage = installEngine(workDir, TARGETS[target]);
    const payload = join(workDir, 'engine.zst');
    const id = await compress(stage, payload, Number(values.level));
    compile({ workDir, target, manifest: { version: enginePkg.version, id, entry: ENTRY }, out });
    const mb = bytes => `${(bytes / 1e6).toFixed(0)} MB`;
    console.log(`\n\x1b[32mdone.\x1b[0m ${relative(process.cwd(), out) || out} — ${mb(statSync(out).size)} (engine ${mb(statSync(payload).size)} compressed)`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
