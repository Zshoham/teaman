import { describe, it, expect, afterEach, vi } from 'vitest';

// config.ts reads TEAMAN_CONFIG at module-eval time, so each case sets the env
// then imports a fresh copy.
async function load(json?: string) {
  vi.resetModules();
  if (json === undefined) delete process.env.TEAMAN_CONFIG;
  else process.env.TEAMAN_CONFIG = json;
  return import('../config');
}

afterEach(() => {
  delete process.env.TEAMAN_CONFIG;
  vi.restoreAllMocks();
});

describe('SITE_CONFIG', () => {
  it('uses DEFAULT_CONFIG when TEAMAN_CONFIG is unset', async () => {
    const { SITE_CONFIG, DEFAULT_CONFIG } = await load(undefined);
    expect(SITE_CONFIG).toEqual(DEFAULT_CONFIG);
    expect(SITE_CONFIG.brand).toBe('vault.teaman');
  });

  it('merges a partial config over the defaults', async () => {
    const { SITE_CONFIG, DEFAULT_CONFIG } = await load(
      JSON.stringify({ brand: 'my.vault', hero: { title: 'Hello' } }),
    );
    expect(SITE_CONFIG.brand).toBe('my.vault');
    // hero is merged one level deep: overridden title, default eyebrow/description.
    expect(SITE_CONFIG.hero.title).toBe('Hello');
    expect(SITE_CONFIG.hero.eyebrow).toBe(DEFAULT_CONFIG.hero.eyebrow);
    // untouched top-level defaults survive.
    expect(SITE_CONFIG.footerNote).toBe(DEFAULT_CONFIG.footerNote);
  });

  it('carries through engine and theme fields', async () => {
    const { SITE_CONFIG } = await load(
      JSON.stringify({ engine: '^2.0', theme: { '--primary': 'red' } }),
    );
    expect(SITE_CONFIG.engine).toBe('^2.0');
    expect(SITE_CONFIG.theme).toEqual({ '--primary': 'red' });
  });

  it('falls back to defaults on invalid JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { SITE_CONFIG, DEFAULT_CONFIG } = await load('{not json');
    expect(SITE_CONFIG).toEqual(DEFAULT_CONFIG);
    expect(warn).toHaveBeenCalled();
  });
});
