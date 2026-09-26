import { describe, expect, it } from 'vitest';
import {
  checkVaultConfig,
  DEFAULT_CONFIG,
  mergeConfig,
  resolveLogoFile,
  siteConfigSchema,
  themeTokenName,
} from '../vault-config.mjs';

describe('mergeConfig', () => {
  it('fills every gap from the defaults, merging hero one level deep', () => {
    const merged = mergeConfig({ brand: 'x', hero: { title: 'T' } });
    expect(merged).toEqual({ ...DEFAULT_CONFIG, brand: 'x', hero: { ...DEFAULT_CONFIG.hero, title: 'T' } });
  });

  it('produces a complete site config from an empty one', () => {
    expect(siteConfigSchema.safeParse(mergeConfig({})).success).toBe(true);
  });
});

describe('checkVaultConfig', () => {
  it('passes a minimal config', () => {
    expect(checkVaultConfig({ brand: 'x' })).toEqual({ problems: [], warnings: [] });
  });

  it('reports schema problems by field and unknown keys at any depth', () => {
    expect(checkVaultConfig({ tagline: 3, links: [{ label: 'a', url: '/a', colour: 'red' }] })).toEqual({
      problems: ['config: brand: required', 'config: tagline: Invalid input: expected string, received number'],
      warnings: ['config: unknown key "links[0].colour"'],
    });
  });

  it('warns on theme tokens the stylesheet lacks, with or without dashes', () => {
    const themeTokens = new Set(['--primary']);
    expect(checkVaultConfig({ brand: 'x', theme: { primary: 'red', '--nope': 'x' } }, { themeTokens }).warnings)
      .toEqual(['theme: unknown token "--nope"']);
    expect(themeTokenName('primary')).toBe('--primary');
  });
});

describe('resolveLogoFile', () => {
  const dirs = files => ({ vaultDir: '/vault', engineDir: '/engine', exists: path => files.includes(path) });

  it('looks in the vault root, then public/, then the engine resources', () => {
    expect(resolveLogoFile('logo.svg', dirs(['/vault/logo.svg', '/vault/public/logo.svg']))).toBe('/vault/logo.svg');
    expect(resolveLogoFile('logo.svg', dirs(['/vault/public/logo.svg']))).toBe('/vault/public/logo.svg');
    expect(resolveLogoFile('teacup.svg', dirs(['/engine/resources/teacup.svg']))).toBe('/engine/resources/teacup.svg');
  });

  it('honours an absolute path only when it exists, and nothing for no logo', () => {
    expect(resolveLogoFile('/abs/logo.svg', dirs(['/abs/logo.svg']))).toBe('/abs/logo.svg');
    expect(resolveLogoFile('/abs/logo.svg', dirs([]))).toBeNull();
    expect(resolveLogoFile(null, dirs([]))).toBeNull();
    expect(resolveLogoFile('missing.svg', dirs([]))).toBeNull();
  });
});
