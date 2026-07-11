// Unit tests for the CLI's pure logic. The module guards its dispatch behind an
// entrypoint check, so importing it here runs no commands — only parseArgs and
// satisfies are exercised.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs, satisfies, validateOutPath, assertOverwritableOut, commitBuild, sweepStagedDirs } from '../teaman.mjs';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('parseArgs', () => {
  it('parses a command with no args', () => {
    expect(parseArgs(['doctor'])).toEqual({ command: 'doctor', vaultArg: undefined, opts: {} });
  });

  it('parses command + vault positional', () => {
    expect(parseArgs(['build', './vault'])).toEqual({
      command: 'build', vaultArg: './vault', opts: {},
    });
  });

  it('parses --key value options', () => {
    const r = parseArgs(['build', './vault', '--out', 'dist', '--base', '/x/']);
    expect(r.opts).toEqual({ out: 'dist', base: '/x/' });
  });

  it('treats a trailing --flag as a boolean', () => {
    expect(parseArgs(['dev', '--open']).opts).toEqual({ open: true });
  });

  it('treats a --flag followed by another --flag as boolean', () => {
    const r = parseArgs(['dev', '--open', '--port', '3001']);
    expect(r.opts).toEqual({ open: true, port: '3001' });
  });

  it('short-circuits on --version / -v before anything else', () => {
    expect(parseArgs(['-v'])).toEqual({ command: '--version' });
    expect(parseArgs(['build', '--version'])).toEqual({ command: '--version' });
  });

  it('maps --help / -h to the help command', () => {
    expect(parseArgs(['-h'])).toEqual({ command: 'help' });
    expect(parseArgs(['anything', '--help'])).toEqual({ command: 'help' });
  });

  it('returns undefined command for empty argv', () => {
    expect(parseArgs([])).toEqual({ command: undefined, vaultArg: undefined, opts: {} });
  });
});

describe('satisfies', () => {
  it('treats empty / wildcard ranges as always satisfied', () => {
    expect(satisfies('1.2.3', undefined)).toBe(true);
    expect(satisfies('1.2.3', '*')).toBe(true);
    expect(satisfies('1.2.3', 'x')).toBe(true);
  });

  it('handles caret ranges (same major, >= min.pat)', () => {
    expect(satisfies('1.2.0', '^1.0.0')).toBe(true);
    expect(satisfies('1.0.0', '^1.0.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('0.9.0', '^1.0.0')).toBe(false);
  });

  it('handles tilde ranges (same major.minor, >= pat)', () => {
    expect(satisfies('1.4.9', '~1.4.0')).toBe(true);
    expect(satisfies('1.5.0', '~1.4.0')).toBe(false);
    expect(satisfies('1.4.0', '~1.4.2')).toBe(false);
  });

  it('handles >= ranges', () => {
    expect(satisfies('1.4.0', '>=1.2.0')).toBe(true);
    expect(satisfies('1.1.0', '>=1.2.0')).toBe(false);
    expect(satisfies('2.0.0', '>=1.2.0')).toBe(true);
  });

  it('handles partial-version wildcards', () => {
    expect(satisfies('1.9.9', '1')).toBe(true);
    expect(satisfies('2.0.0', '1.x')).toBe(false);
    expect(satisfies('1.4.7', '1.4')).toBe(true);
    expect(satisfies('1.5.0', '1.4.x')).toBe(false);
  });

  it('handles exact ranges', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  it('does not cry wolf on unparseable ranges', () => {
    expect(satisfies('1.2.3', 'garbage')).toBe(true);
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

describe('assertOverwritableOut', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-overwrite-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('allows a nonexistent path', () => {
    expect(() => assertOverwritableOut(join(dir, 'nope'))).not.toThrow();
  });

  it('allows an empty directory', () => {
    const out = join(dir, 'empty');
    mkdirSync(out);
    expect(() => assertOverwritableOut(out)).not.toThrow();
  });

  it('allows a previous build (has index.html at root)', () => {
    const out = join(dir, 'prev');
    mkdirSync(out);
    writeFileSync(join(out, 'index.html'), '<html></html>');
    writeFileSync(join(out, 'other.txt'), 'x');
    expect(() => assertOverwritableOut(out)).not.toThrow();
  });

  it('refuses a non-empty dir without index.html', () => {
    const out = join(dir, 'userdata');
    mkdirSync(out);
    writeFileSync(join(out, 'note.md'), '# keep');
    expect(() => assertOverwritableOut(out)).toThrow(/refusing to overwrite non-empty directory/);
  });
});

describe('sweepStagedDirs', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-sweep-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('removes leaked staged and backup siblings, leaving everything else', () => {
    const out = join(dir, 'dist');
    for (const name of ['.dist.teaman-123-456', 'dist.teaman-backup-123-456', 'dist', '.dist.other', 'distant']) {
      mkdirSync(join(dir, name));
    }
    sweepStagedDirs(out);
    expect(readdirSync(dir).sort()).toEqual(['.dist.other', 'dist', 'distant']);
  });

  it('is a no-op when the parent directory does not exist', () => {
    expect(() => sweepStagedDirs(join(dir, 'missing', 'dist'))).not.toThrow();
  });
});

describe('commitBuild', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-commit-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  // Build a staged dir with a single marker file and return its path.
  function staged(name, marker) {
    const p = join(dir, name);
    mkdirSync(p);
    writeFileSync(join(p, 'index.html'), marker);
    return p;
  }

  it('moves staged into place when out does not exist', () => {
    const stagedOut = staged('.dist.staged', 'fresh');
    const out = join(dir, 'dist');
    commitBuild(stagedOut, out);
    expect(existsSync(stagedOut)).toBe(false);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('fresh');
  });

  it('replaces existing out, dropping the old content and the backup', () => {
    const out = join(dir, 'dist');
    mkdirSync(out);
    writeFileSync(join(out, 'index.html'), 'old');
    writeFileSync(join(out, 'stale.txt'), 'gone');
    const stagedOut = staged('.dist.staged', 'new');
    commitBuild(stagedOut, out);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('new');
    expect(existsSync(join(out, 'stale.txt'))).toBe(false);
    // no backup sibling left behind
    expect(readdirSync(dir)).toEqual(['dist']);
  });

  it('rolls back the original out when the staged rename fails', () => {
    const out = join(dir, 'dist');
    mkdirSync(out);
    writeFileSync(join(out, 'index.html'), 'original');
    const missingStaged = join(dir, '.dist.does-not-exist');
    expect(() => commitBuild(missingStaged, out)).toThrow();
    // original content restored, no backup sibling lingering
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('original');
    expect(readdirSync(dir)).toEqual(['dist']);
  });
});
