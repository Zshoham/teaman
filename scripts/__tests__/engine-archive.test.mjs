// The single-file binary's two halves have to agree: scripts/build-binary.mjs
// packs the installed engine with archiveEntries, and bin/teaman-binary.mjs
// unpacks it on first run with extractArchive. The binary itself is built and
// exercised by `bun run build:binary` (and CI's binary job).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createZstdCompress, createZstdDecompress } from 'node:zlib';
import { archiveEntries, extractArchive } from '../engine-archive.mjs';
import { binaryName, pruneMuslPackages } from '../build-binary.mjs';
import { cacheRoot, ensureEngine } from '../../bin/teaman-binary.mjs';

/** The compressed archive of `src`, as build-binary embeds it. */
const compressed = src => Readable.from(archiveEntries(src)).pipe(createZstdCompress());

/** A single archive record, framed the way archiveEntries frames one. */
function rawRecord(header, data = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(json.length);
  return Buffer.concat([size, json, data]);
}

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-archive-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('engine archive', () => {
  it('round-trips a tree: nested dirs, empty files and dirs, binary content, modes', async () => {
    const src = join(dir, 'src');
    mkdirSync(join(src, 'node_modules', 'pkg', 'bin'), { recursive: true });
    mkdirSync(join(src, 'empty'));
    writeFileSync(join(src, 'node_modules', 'pkg', 'index.js'), 'export default 1;\n');
    writeFileSync(join(src, 'node_modules', 'pkg', 'bin', 'tool'), '#!/bin/sh\n', { mode: 0o755 });
    writeFileSync(join(src, 'blank.txt'), '');
    const binary = Buffer.from(Array.from({ length: 70_000 }, (_, i) => i % 251));
    writeFileSync(join(src, 'addon.node'), binary);

    const dest = join(dir, 'dest');
    await extractArchive(compressed(src).pipe(createZstdDecompress()), dest);

    expect(readFileSync(join(dest, 'node_modules', 'pkg', 'index.js'), 'utf8')).toBe('export default 1;\n');
    expect(readFileSync(join(dest, 'addon.node')).equals(binary)).toBe(true);
    expect(readFileSync(join(dest, 'blank.txt'), 'utf8')).toBe('');
    expect(statSync(join(dest, 'empty')).isDirectory()).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(join(dest, 'node_modules', 'pkg', 'bin', 'tool')).mode & 0o111).not.toBe(0);
    }
  });

  it('leaves out .bin shim dirs and source maps', async () => {
    const src = join(dir, 'src');
    mkdirSync(join(src, 'node_modules', '.bin'), { recursive: true });
    mkdirSync(join(src, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(src, 'node_modules', 'pkg', 'index.js'), '');
    writeFileSync(join(src, 'node_modules', 'pkg', 'index.js.map'), '{}');
    if (process.platform !== 'win32') symlinkSync('../pkg/index.js', join(src, 'node_modules', '.bin', 'pkg'));

    const dest = join(dir, 'dest');
    await extractArchive(compressed(src).pipe(createZstdDecompress()), dest);

    expect(readdirSync(join(dest, 'node_modules'))).toEqual(['pkg']);
    expect(readdirSync(join(dest, 'node_modules', 'pkg'))).toEqual(['index.js']);
  });

  it.skipIf(process.platform === 'win32')('refuses a symlink it would have to recreate', () => {
    const src = join(dir, 'src');
    mkdirSync(src);
    writeFileSync(join(src, 'real.js'), '');
    symlinkSync('real.js', join(src, 'alias.js'));
    expect(() => [...archiveEntries(src)]).toThrow(/cannot pack symlink alias\.js/);
  });

  it('refuses an entry that escapes the destination', async () => {
    const evil = rawRecord({ p: '../outside.txt', t: 'f', m: 0o644, s: 1 }, Buffer.from('x'));
    await expect(extractArchive(Readable.from([evil]), join(dir, 'dest'))).rejects.toThrow(/escapes its root/);
    expect(existsSync(join(dir, 'outside.txt'))).toBe(false);
  });

  it('fails on a truncated archive rather than leaving a short file', async () => {
    const whole = rawRecord({ p: 'a.txt', t: 'f', m: 0o644, s: 10 }, Buffer.from('0123456789'));
    await expect(extractArchive(Readable.from([whole.subarray(0, whole.length - 3)]), join(dir, 'dest')))
      .rejects.toThrow(/truncated/);
  });
});

describe('ensureEngine', () => {
  const manifest = { version: '9.9.9', id: 'abc123' };

  it('unpacks once into engine-<version>-<id>, then reuses it', async () => {
    const src = join(dir, 'src');
    mkdirSync(src);
    writeFileSync(join(src, 'teaman.mjs'), 'v1');
    const root = join(dir, 'cache');
    let opened = 0;
    const open = () => { opened++; return compressed(src); };

    const first = await ensureEngine(manifest, open, root);
    expect(first).toBe(join(root, 'engine-9.9.9-abc123'));
    expect(readFileSync(join(first, 'teaman.mjs'), 'utf8')).toBe('v1');

    expect(await ensureEngine(manifest, open, root)).toBe(first);
    expect(opened).toBe(1);
    // No half-unpacked sibling is left behind.
    expect(readdirSync(root)).toEqual(['engine-9.9.9-abc123']);
  });

  it('leaves nothing behind when unpacking fails', async () => {
    const root = join(dir, 'cache');
    const broken = () => Readable.from([Buffer.from('not zstd')]);
    await expect(ensureEngine(manifest, broken, root)).rejects.toThrow();
    expect(readdirSync(root)).toEqual([]);
  });
});

describe('pruneMuslPackages', () => {
  const pkg = (path, json) => {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify(json));
  };

  it('removes musl-only packages, top-level, scoped, and nested', () => {
    const nm = join(dir, 'node_modules');
    pkg(join(nm, 'lightningcss-linux-x64-gnu'), { libc: ['glibc'] });
    pkg(join(nm, 'lightningcss-linux-x64-musl'), { libc: ['musl'] });
    pkg(join(nm, '@img', 'sharp-linuxmusl-x64'), { libc: ['musl'] });
    pkg(join(nm, 'plain'), {});
    pkg(join(nm, 'host', 'node_modules', 'dep-musl'), { libc: ['musl'] });

    expect(pruneMuslPackages(nm).sort()).toEqual([
      '@img/sharp-linuxmusl-x64', 'host/node_modules/dep-musl', 'lightningcss-linux-x64-musl',
    ]);
    expect(existsSync(join(nm, 'lightningcss-linux-x64-gnu'))).toBe(true);
    expect(existsSync(join(nm, 'plain'))).toBe(true);
  });
});

describe('binaryName', () => {
  it('names each supported target', () => {
    expect(binaryName('bun-linux-x64')).toBe('teaman-linux-x64');
    expect(binaryName('bun-darwin-arm64')).toBe('teaman-darwin-arm64');
    expect(binaryName('bun-windows-x64')).toBe('teaman-win32-x64.exe');
  });

  it('rejects a target it cannot build', () => {
    expect(() => binaryName('bun-linux-x64-musl')).toThrow(/unsupported target/);
  });
});

describe('cacheRoot', () => {
  it('honours TEAMAN_CACHE_DIR everywhere', () => {
    expect(cacheRoot({ TEAMAN_CACHE_DIR: '/x/cache' }, 'linux', '/home/u')).toBe('/x/cache');
  });

  it('uses XDG_CACHE_HOME, else ~/.cache, on Linux', () => {
    expect(cacheRoot({ XDG_CACHE_HOME: '/xdg' }, 'linux', '/home/u')).toBe(join('/xdg', 'teaman'));
    expect(cacheRoot({}, 'linux', '/home/u')).toBe(join('/home/u', '.cache', 'teaman'));
  });

  it('uses ~/Library/Caches on macOS and LOCALAPPDATA on Windows', () => {
    expect(cacheRoot({}, 'darwin', '/Users/u')).toBe(join('/Users/u', 'Library', 'Caches', 'teaman'));
    expect(cacheRoot({ LOCALAPPDATA: '/appdata' }, 'win32', '/home/u')).toBe(join('/appdata', 'teaman'));
  });
});
