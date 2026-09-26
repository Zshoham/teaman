// The single-file teaman binary's launcher, compiled by `bun build --compile`
// (see scripts/build-binary.mjs) together with one embedded file: the whole
// installed engine — the packed package plus its production node_modules — as
// a zstd-compressed archive (scripts/engine-archive.mjs).
//
// The engine cannot run out of the executable: Astro, Vite and Slidev read
// their own files from disk, native addons (typst, lightningcss, pagefind…)
// must be real files to load, and the engine writes its caches into its own
// directory. So on first run the archive is unpacked into a per-version cache
// dir, and every run after that goes straight to it.
//
// The binary is also the engine's Bun. The CLI starts every stage as
// `process.execPath <script>`, which here is this executable, and
// BUN_BE_BUN=1 makes a compiled Bun binary behave as the plain `bun` CLI. So
// the launcher runs the CLI as a child of itself with that set, and everything
// the CLI starts inherits it.

import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { Readable } from 'stream';
import { createZstdDecompress } from 'zlib';
import { extractArchive } from '../scripts/engine-archive.mjs';

/** Where unpacked engines live: TEAMAN_CACHE_DIR, else the platform cache dir. */
export function cacheRoot(env = process.env, platform = process.platform, home = homedir()) {
  if (env.TEAMAN_CACHE_DIR) return resolve(env.TEAMAN_CACHE_DIR);
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'teaman');
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'teaman');
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'teaman');
}

/**
 * The unpacked engine for this binary, unpacking it first if it is not there.
 * Unpacks into a private sibling and renames it into place, so a killed first
 * run never leaves a half-engine behind, and two first runs racing each other
 * both end up on one complete copy.
 *
 * @param {{ version: string, id: string }} manifest
 * @param {() => AsyncIterable<Buffer>} openPayload the compressed archive
 */
export async function ensureEngine(manifest, openPayload, root = cacheRoot()) {
  const dir = join(root, `engine-${manifest.version}-${manifest.id}`);
  if (existsSync(dir)) return dir;

  mkdirSync(root, { recursive: true });
  process.stderr.write(`\x1b[2mteaman\x1b[0m unpacking engine ${manifest.version} into ${dir} (first run only)…\n`);
  const partial = mkdtempSync(join(root, `.partial-${process.pid}-`));
  try {
    await extractArchive(Readable.from(openPayload()).pipe(createZstdDecompress()), partial);
    try {
      renameSync(partial, dir);
    } catch (error) {
      if (!existsSync(dir)) throw error; // anything but "another run got there first"
    }
  } finally {
    rmSync(partial, { recursive: true, force: true });
  }
  return dir;
}

/**
 * Run the CLI from the unpacked engine and mirror how it ends.
 * @param {{ payload: string, manifest: { version: string, id: string, entry: string } }} embedded
 */
export async function launch({ payload, manifest }, args = process.argv.slice(2)) {
  const engine = await ensureEngine(manifest, () => Readable.fromWeb(Bun.file(payload).stream()));
  const child = spawn(process.execPath, [join(engine, manifest.entry), ...args], {
    stdio: 'inherit',
    env: { ...process.env, BUN_BE_BUN: '1' },
  });
  // Ctrl-C already reaches the whole foreground process group, the child
  // included, so the launcher just outlives it; a signal sent to the launcher
  // alone (kill, a closed terminal) is passed on.
  process.on('SIGINT', () => {});
  for (const signal of ['SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('error', error => {
    console.error(`teaman: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
