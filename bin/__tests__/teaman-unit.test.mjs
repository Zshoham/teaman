// Unit tests for the CLI's pure logic. The module guards its dispatch behind an
// entrypoint check, so importing it here runs no commands — only parseArgs and
// satisfies are exercised.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs, satisfies, serverArgs, validateConfig, stageStatic } from '../teaman.mjs';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
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
