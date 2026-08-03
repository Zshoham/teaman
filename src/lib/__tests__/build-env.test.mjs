import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAbsolute } from 'path';

const VARS = ['TEAMAN_VAULT', 'TEAMAN_OUT', 'TEAMAN_PUBLIC', 'TEAMAN_BASE', 'SITE_BASE', 'TEAMAN_CONFIG'];

// build-env reads the seam at module-eval time, so each case sets the env then
// imports a fresh copy of the module.
async function load(env = {}) {
  vi.resetModules();
  for (const name of VARS) delete process.env[name];
  for (const [name, value] of Object.entries(env)) process.env[name] = value;
  return import('../build-env.mjs');
}

const posix = value => value.replace(/\\/g, '/');

afterEach(() => {
  for (const name of VARS) delete process.env[name];
  vi.restoreAllMocks();
});

describe('build-env', () => {
  it('falls back to the bundled example/ vault and public/ output', async () => {
    const { vaultDir, outDir, publicDir } = await load();
    expect(posix(vaultDir)).toMatch(/\/example$/);
    expect(posix(outDir)).toMatch(/\/public$/);
    expect(posix(publicDir)).toMatch(/\/resources$/);
  });

  it('uses absolute env paths verbatim', async () => {
    const { vaultDir, outDir, publicDir } = await load({
      TEAMAN_VAULT: '/tmp/my-vault',
      TEAMAN_OUT: '/tmp/out',
      TEAMAN_PUBLIC: '/tmp/staged',
    });
    expect(vaultDir).toBe('/tmp/my-vault');
    expect(outDir).toBe('/tmp/out');
    expect(publicDir).toBe('/tmp/staged');
  });

  it('resolves relative env paths to absolute ones', async () => {
    const { vaultDir, outDir } = await load({ TEAMAN_VAULT: 'some/vault', TEAMAN_OUT: 'dist' });
    expect(isAbsolute(vaultDir)).toBe(true);
    expect(isAbsolute(outDir)).toBe(true);
    expect(posix(vaultDir)).toMatch(/\/some\/vault$/);
  });

  it('normalizes the base path and honours the legacy SITE_BASE', async () => {
    expect((await load()).siteBase).toBe('/');
    expect((await load({ TEAMAN_BASE: 'sub' })).siteBase).toBe('/sub/');
    expect((await load({ SITE_BASE: '/legacy' })).siteBase).toBe('/legacy/');
    // TEAMAN_BASE wins when both are set.
    expect((await load({ TEAMAN_BASE: '/new/', SITE_BASE: '/old/' })).siteBase).toBe('/new/');
  });

  it('parses TEAMAN_CONFIG, defaulting to an empty config', async () => {
    expect((await load()).teamanConfig).toEqual({});
    expect((await load({ TEAMAN_CONFIG: '{"brand":"x"}' })).teamanConfig).toEqual({ brand: 'x' });
  });

  it('warns and falls back to defaults when TEAMAN_CONFIG is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { teamanConfig } = await load({ TEAMAN_CONFIG: '{not json' });
    expect(teamanConfig).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not parse TEAMAN_CONFIG'),
      expect.anything(),
    );
  });
});
