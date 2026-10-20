// Unit tests for the CLI's pure logic. The module guards its dispatch behind an
// entrypoint check, so importing it here runs no commands — only parseArgs and
// satisfies are exercised.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs, satisfies, validateOutPath, assertOverwritableOut, commitBuild, sweepStagedDirs, sweepEngineStaging, moveStagedBuild, serverArgs, validateConfig, stageStatic, runBuildPipeline } from '../teaman.mjs';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

  it('parses the attached --key=value form', () => {
    expect(parseArgs(['build', './vault', '--out=dist', '--base=/x/']).opts)
      .toEqual({ out: 'dist', base: '/x/' });
  });

  // --host is the one flag whose value is optional, so the generic
  // "next token is the value" rule would eat the vault positional.
  describe('--host', () => {
    it('takes an address that follows it', () => {
      expect(parseArgs(['dev', '--host', '0.0.0.0'])).toEqual({
        command: 'dev', vaultArg: undefined, opts: { host: '0.0.0.0' },
      });
      expect(parseArgs(['dev', '--host', '::1']).opts).toEqual({ host: '::1' });
      expect(parseArgs(['dev', '--host', 'fe80::1']).opts).toEqual({ host: 'fe80::1' });
      expect(parseArgs(['dev', '--host', 'localhost']).opts).toEqual({ host: 'localhost' });
      expect(parseArgs(['dev', '--host', 'my.box.local']).opts).toEqual({ host: 'my.box.local' });
    });

    it('is boolean at the end of the line', () => {
      expect(parseArgs(['dev', './vault', '--host']).opts).toEqual({ host: true });
    });

    it('does not swallow a vault path that follows it', () => {
      expect(parseArgs(['dev', '--host', './vault'])).toEqual({
        command: 'dev', vaultArg: './vault', opts: { host: true },
      });
      expect(parseArgs(['preview', '--host', '/srv/vault'])).toEqual({
        command: 'preview', vaultArg: '/srv/vault', opts: { host: true },
      });
    });

    // Nothing on disk says whether a bare `vault` is a directory or a host, so
    // it stays the positional: a missing vault stops the CLI with a path error,
    // where the other guess would quietly serve the cwd instead.
    it('leaves a bare single-label token as the vault, present or not', () => {
      expect(parseArgs(['dev', '--host', 'vault'])).toEqual({
        command: 'dev', vaultArg: 'vault', opts: { host: true },
      });
      expect(parseArgs(['dev', '--host', 'my-vault']).vaultArg).toBe('my-vault');
    });

    it('does not swallow a dotted name that is a directory here', () => {
      const dir = mkdtempSync(join(tmpdir(), 'teaman-host-'));
      const cwd = process.cwd();
      mkdirSync(join(dir, 'my.vault'));
      process.chdir(dir);
      try {
        expect(parseArgs(['dev', '--host', 'my.vault'])).toEqual({
          command: 'dev', vaultArg: 'my.vault', opts: { host: true },
        });
      } finally {
        process.chdir(cwd);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('takes any host from the attached form', () => {
      expect(parseArgs(['dev', '--host=vault', './v'])).toEqual({
        command: 'dev', vaultArg: './v', opts: { host: 'vault' },
      });
    });

    it('still takes the value alongside other options', () => {
      expect(parseArgs(['dev', './vault', '--host', '0.0.0.0', '--port', '3001']).opts)
        .toEqual({ host: '0.0.0.0', port: '3001' });
    });
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

describe('sweepEngineStaging', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-engine-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  // A pid that is certainly not running: allocate one and reap it.
  const deadPid = (() => {
    const p = spawnSync(process.execPath, ['-e', '0']);
    return p.pid;
  })();

  it('removes leaked build staging dirs, leaving the engine alone', () => {
    for (const name of [`.teaman-out-${deadPid}-abc123`, `.teaman-out-${deadPid}-def456`, '.astro', 'src', 'package.json']) {
      if (name.includes('.json')) writeFileSync(join(dir, name), '{}');
      else mkdirSync(join(dir, name));
    }
    sweepEngineStaging(dir);
    expect(readdirSync(dir).sort()).toEqual(['.astro', 'package.json', 'src']);
  });

  // The staging dirs are shared ground: every vault built by this engine gets
  // one, so a second build must not delete the dir a running build is filling.
  it('leaves a staging dir whose owning process is still alive', () => {
    mkdirSync(join(dir, `.teaman-out-${process.pid}-live0`));
    mkdirSync(join(dir, `.teaman-out-${deadPid}-stale0`));
    sweepEngineStaging(dir);
    expect(readdirSync(dir)).toEqual([`.teaman-out-${process.pid}-live0`]);
  });

  it('removes a staging dir with no parseable pid', () => {
    mkdirSync(join(dir, '.teaman-out-legacy'));
    sweepEngineStaging(dir);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('is a no-op when the directory does not exist', () => {
    expect(() => sweepEngineStaging(join(dir, 'missing'))).not.toThrow();
  });
});

// The build stages the site next to Astro's cache (inside the engine) and moves
// it out at the end, so this move is what has to survive a destination on a
// different filesystem — a Docker bind mount, a separate disk.
describe('moveStagedBuild', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-move-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function staged(name, marker) {
    const p = join(dir, name);
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, 'index.html'), marker);
    return p;
  }

  it('renames within one filesystem, consuming the source', () => {
    const from = staged('staging/dist', 'site');
    const to = join(dir, '.dist.teaman-1-2');
    moveStagedBuild(from, to);
    expect(existsSync(from)).toBe(false);
    expect(readFileSync(join(to, 'index.html'), 'utf8')).toBe('site');
  });

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

describe('serverArgs', () => {
  it('is empty without options', () => {
    expect(serverArgs({})).toEqual([]);
    expect(serverArgs()).toEqual([]);
  });

  it('passes --port through as a string', () => {
    expect(serverArgs({ port: 3001 })).toEqual(['--port', '3001']);
  });

  it('passes a bare --host as a bare flag (every interface)', () => {
    expect(serverArgs({ host: true })).toEqual(['--host']);
  });

  it('passes --host <addr> through', () => {
    expect(serverArgs({ port: '4321', host: '0.0.0.0' })).toEqual(['--port', '4321', '--host', '0.0.0.0']);
  });
});

describe('runBuildPipeline', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-pipeline-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  // A build in progress: the previous site at `out`, Astro's cache, a staged
  // out dir, and a scratch dir, with stages that each write one file.
  function setup() {
    const out = join(dir, 'dist');
    mkdirSync(out);
    writeFileSync(join(out, 'index.html'), 'previous');
    const astroCache = join(dir, '.astro');
    mkdirSync(astroCache);
    const stagedRoot = join(dir, '.teaman-out-1-x');
    const stagedOut = join(stagedRoot, 'dist');
    const workDir = join(dir, 'work');
    mkdirSync(workDir);
    const ran = [];
    const stage = (name, fail = false) => [name, fail ? 'fail' : 'ok'];
    const run = async ([name, outcome]) => {
      ran.push(name);
      expect(existsSync(astroCache), 'cache dropped first').toBe(false);
      if (outcome === 'fail') throw new Error(`${name} exited with code 1`);
      mkdirSync(stagedOut, { recursive: true });
      writeFileSync(join(stagedOut, `${name}.html`), name);
    };
    const pipeline = stages => runBuildPipeline({ stages, run, stagedOut, out, removeAfter: [stagedRoot, workDir], astroCache });
    return { out, stagedRoot, workDir, ran, stage, pipeline };
  }

  it('runs every stage in order into the staged dir, then swaps the site into place', async () => {
    const { out, stagedRoot, workDir, ran, stage, pipeline } = setup();
    await pipeline([stage('astro'), stage('references'), stage('slides'), stage('search')]);
    expect(ran).toEqual(['astro', 'references', 'slides', 'search']);
    expect(readdirSync(out).sort()).toEqual(['astro.html', 'references.html', 'search.html', 'slides.html']);
    expect(readdirSync(dir).sort()).toEqual(['dist']);
    expect(existsSync(stagedRoot) || existsSync(workDir)).toBe(false);
  });

  it('stops at a failing stage, leaving the previous site and no scratch dirs', async () => {
    const { out, ran, stage, pipeline } = setup();
    await expect(pipeline([stage('astro'), stage('references', true), stage('slides')]))
      .rejects.toThrow('references exited with code 1');
    expect(ran).toEqual(['astro', 'references']);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('previous');
    expect(readdirSync(dir)).toEqual(['dist']);
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

// `doctor` composes validateConfig, testable without a vault on disk, and
// lintVault (src/lib/vault-lint.mjs), tested there against scratch vaults.
describe('validateConfig', () => {
  const ok = { hasConfigFile: true, themeTokens: new Set(['--primary']) };

  it('reports nothing for a minimal valid config', () => {
    expect(validateConfig({ brand: 'x' }, ok)).toEqual({ problems: [], warnings: [] });
  });

  it('requires a brand once a config file exists', () => {
    expect(validateConfig({}, ok).problems).toContain('config: brand: required');
  });

  // A vault with no config file runs on engine defaults, so its "missing
  // brand" is not a problem to report.
  it('skips config checks entirely when there is no config file', () => {
    expect(validateConfig({}, { ...ok, hasConfigFile: false }))
      .toEqual({ problems: [], warnings: [] });
  });

  it('still checks the engine range without a config file', () => {
    const { warnings } = validateConfig(
      { engine: '^99.0.0' },
      { ...ok, hasConfigFile: false, version: '1.5.0' },
    );
    expect(warnings).toEqual(['engine range ^99.0.0 excludes running engine 1.5.0']);
  });

  it('warns on unknown top-level, hero and slides keys', () => {
    const { warnings } = validateConfig(
      { brand: 'x', nope: 1, hero: { title: 't', bogus: 1 }, slides: { weird: 1 } },
      ok,
    );
    expect(warnings).toEqual([
      'config: unknown key "nope"',
      'config: unknown key "hero.bogus"',
      'config: unknown key "slides.weird"',
    ]);
  });

  it('requires a hero title when hero is present', () => {
    expect(validateConfig({ brand: 'x', hero: { eyebrow: 'hi' } }, ok).problems)
      .toContain('config: hero.title: required');
  });

  it('validates links entries', () => {
    const { problems, warnings } = validateConfig(
      { brand: 'x', links: [{ url: 'ftp://x' }, { label: 'a', url: '/ok', extra: 1 }] },
      ok,
    );
    expect(problems).toContain('config: links[0].label: required');
    expect(warnings).toContain('config: links[0].url "ftp://x" doesn\'t look like a URL');
    expect(warnings).toContain('config: unknown key "links[1].extra"');
  });

  it('rejects a non-array links', () => {
    expect(validateConfig({ brand: 'x', links: {} }, ok).problems)
      .toContain('config: links: Invalid input: expected array, received object');
  });

  it('validates smartLinks services and hostnames', () => {
    const { problems, warnings } = validateConfig(
      { brand: 'x', smartLinks: { gitlab: ['git.example.com'], nope: [], jira: 'no' } },
      ok,
    );
    expect(warnings).toContain('config: unknown key "smartLinks.nope"');
    expect(problems).toContain('config: smartLinks.jira: Invalid input: expected array, received string');
    expect(validateConfig({ brand: 'x', smartLinks: { gitlab: ['not a host!'] } }, ok).warnings)
      .toEqual([expect.stringContaining("doesn't look like a hostname")]);
  });

  it('warns on theme tokens the stylesheet does not define', () => {
    const { warnings } = validateConfig({ brand: 'x', theme: { '--nope': 'red' } }, ok);
    expect(warnings).toEqual(['theme: unknown token "--nope"']);
  });

  it('accepts a theme token written without the leading dashes', () => {
    expect(validateConfig({ brand: 'x', theme: { primary: 'red' } }, ok).warnings).toEqual([]);
  });
});

describe('stageStatic', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-static-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('publishes the engine public assets and the vault public dir, never engine inputs', () => {
    const vault = join(dir, 'vault');
    mkdirSync(join(vault, 'public'), { recursive: true });
    writeFileSync(join(vault, 'public', 'robots.txt'), 'ok');
    const staged = join(dir, 'staged');
    const { publicDir, config } = stageStatic(vault, { logo: 'teacup.svg' }, staged);
    expect(publicDir).toBe(staged);
    expect(config.logo).toBe('teacup.svg');
    expect(readdirSync(staged).sort()).toEqual(['robots.txt', 'teacup.svg']);
  });
});
