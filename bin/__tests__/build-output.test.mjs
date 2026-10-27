// The build-output lifecycle, through the one interface the CLI uses: a fake
// stage runner writes the site, and each test reads what lands where.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSite, moveStagedBuild, validateOutPath } from '../build-output.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-output-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// A pid that is certainly not running: allocate one and reap it.
const deadPid = spawnSync(process.execPath, ['-e', '0']).pid;

/**
 * A vault, an engine (with Astro's cache in it), and a previous site at
 * `vault/dist`. `build(stages)` runs stages named `name` or `name!` (fails),
 * each writing `<name>.html` into the staged dir.
 */
function setup() {
  const vault = join(dir, 'vault');
  const engine = join(dir, 'engine');
  const out = join(vault, 'dist');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), 'previous');
  writeFileSync(join(out, 'stale.html'), 'stale');
  mkdirSync(join(engine, '.astro'), { recursive: true });
  const ran = [];
  const seen = {};
  const build = (stages, options = {}) => buildSite({
    out,
    vault,
    engine,
    cwd: dir,
    stages,
    prepare: ({ stagedOut, workDir }) => {
      Object.assign(seen, { stagedOut, workDir });
      writeFileSync(join(workDir, 'input'), 'staged input');
      return async name => {
        ran.push(name);
        expect(existsSync(join(engine, '.astro')), 'cache dropped first').toBe(false);
        if (name.endsWith('!')) throw new Error(`${name} exited with code 1`);
        mkdirSync(stagedOut, { recursive: true });
        writeFileSync(join(stagedOut, `${name}.html`), name);
      };
    },
    ...options,
  });
  return { vault, engine, out, ran, seen, build };
}

describe('buildSite', () => {
  it('runs every stage in order into one staged dir, then swaps the site into place', async () => {
    const { vault, engine, out, ran, seen, build } = setup();
    expect(await build(['astro', 'references', 'slides', 'search'])).toBe(out);
    expect(ran).toEqual(['astro', 'references', 'slides', 'search']);
    expect(readdirSync(out).sort()).toEqual(['astro.html', 'references.html', 'search.html', 'slides.html']);
    expect(seen.stagedOut.startsWith(engine)).toBe(true);
    // Nothing left beside the site, in the engine, or in the work dir.
    expect(readdirSync(vault)).toEqual(['dist']);
    expect(readdirSync(engine)).toEqual([]);
    expect(existsSync(seen.workDir)).toBe(false);
  });

  it('stops at a failing stage, leaving the previous site and no scratch dirs', async () => {
    const { vault, engine, out, ran, seen, build } = setup();
    await expect(build(['astro', 'references!', 'slides'])).rejects.toThrow('references! exited with code 1');
    expect(ran).toEqual(['astro', 'references!']);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('previous');
    expect(readdirSync(vault)).toEqual(['dist']);
    expect(readdirSync(engine)).toEqual([]);
    expect(existsSync(seen.workDir)).toBe(false);
  });

  it('sweeps what a killed build left, but not a running build’s staging', async () => {
    const { vault, engine, build } = setup();
    for (const name of ['.dist.teaman-123-456', 'dist.teaman-backup-123-456', '.dist.other', 'distant']) {
      mkdirSync(join(vault, name));
    }
    for (const name of [`.teaman-out-${deadPid}-abc`, '.teaman-out-legacy', `.teaman-out-${process.pid}-live`, 'src']) {
      mkdirSync(join(engine, name));
    }
    await build(['astro']);
    expect(readdirSync(vault).sort()).toEqual(['.dist.other', 'dist', 'distant']);
    expect(readdirSync(engine).sort()).toEqual([`.teaman-out-${process.pid}-live`, 'src']);
  });

  it('builds into a fresh out, making its parent', async () => {
    const { vault, build } = setup();
    const out = join(dir, 'deploy', 'site');
    expect(await build(['astro'], { out })).toBe(out);
    expect(readdirSync(out)).toEqual(['astro.html']);
    expect(readFileSync(join(vault, 'dist', 'index.html'), 'utf8')).toBe('previous');
  });

  it('refuses an out holding something other than a previous build, before running anything', async () => {
    const { vault, ran, build } = setup();
    const notes = join(vault, 'notes');
    mkdirSync(notes);
    writeFileSync(join(notes, 'keep.md'), '# keep');
    await expect(build(['astro'], { out: notes })).rejects.toThrow(/refusing to overwrite non-empty directory/);
    expect(ran).toEqual([]);
    expect(readdirSync(notes)).toEqual(['keep.md']);
  });

  it('accepts an empty out, or one holding a previous build', async () => {
    const { vault, build } = setup();
    const empty = join(vault, 'empty');
    mkdirSync(empty);
    await expect(build(['astro'], { out: empty })).resolves.toBe(empty);
    await expect(build(['astro'], { out: join(vault, 'dist') })).resolves.toBe(join(vault, 'dist'));
  });
});

describe('validateOutPath', () => {
  const vault = resolve('/tmp/example-vault');
  const engine = resolve('/tmp/example-engine');
  const cwd = resolve('/tmp/caller');

  it('accepts a normal destination inside the vault', () => {
    expect(validateOutPath(join(vault, 'dist'), { vault, engine, cwd })).toBe(join(vault, 'dist'));
  });

  it.each([
    ['filesystem root', resolve('/')],
    ['vault root', vault],
    ['engine root', engine],
    ['current directory', cwd],
    ['vault public source', join(vault, 'public')],
    ['vault ancestor', resolve('/tmp')],
  ])('rejects the %s', (_label, out) => {
    expect(() => validateOutPath(out, { vault, engine, cwd })).toThrow(/refusing/);
  });
});

// The build stages the site next to Astro's cache (inside the engine) and moves
// it out at the end, so this move is what has to survive a destination on a
// different filesystem — a Docker bind mount, a separate disk.
describe('moveStagedBuild', () => {
  function staged(name, marker) {
    const p = join(dir, name);
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, 'index.html'), marker);
    return p;
  }

  it('propagates a failure that is not a cross-device rename', () => {
    expect(() => moveStagedBuild(join(dir, 'does-not-exist'), join(dir, 'dest'))).toThrow();
  });

  // A real second filesystem, where the plain rename raises EXDEV. /dev/shm is
  // tmpfs on Linux; elsewhere there is nothing portable to point at, so skip.
  const otherFs = ['/dev/shm'].find(p => {
    try { return statSync(p).dev !== statSync(tmpdir()).dev; } catch { return false; }
  });

  it.skipIf(!otherFs)('copies when the destination is on another filesystem', () => {
    const from = staged('staging/dist', 'site');
    const dest = mkdtempSync(join(otherFs, 'teaman-move-'));
    const to = join(dest, '.dist.teaman-1-2');
    try {
      moveStagedBuild(from, to);
      expect(existsSync(from)).toBe(false);
      expect(readFileSync(join(to, 'index.html'), 'utf8')).toBe('site');
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
