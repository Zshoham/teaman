import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAbsolute } from 'path';

// content-paths reads TEAMAN_VAULT at module-eval time, so each case sets the
// env then imports a fresh copy of the module.
async function load(vault?: string) {
  vi.resetModules();
  if (vault === undefined) delete process.env.TEAMAN_VAULT;
  else process.env.TEAMAN_VAULT = vault;
  return import('../content-paths');
}

afterEach(() => {
  delete process.env.TEAMAN_VAULT;
});

describe('content-paths', () => {
  it('falls back to the bundled example/ vault when TEAMAN_VAULT is unset', async () => {
    const { contentRoot, notesRoot, guidesRoot, slidesRoot, dailiesRoot } = await load(undefined);
    expect(contentRoot.replace(/\\/g, '/')).toMatch(/\/example$/);
    expect(notesRoot.replace(/\\/g, '/')).toMatch(/\/example\/notes$/);
    expect(guidesRoot.replace(/\\/g, '/')).toMatch(/\/example\/guides$/);
    expect(slidesRoot.replace(/\\/g, '/')).toMatch(/\/example\/slides$/);
    expect(dailiesRoot.replace(/\\/g, '/')).toMatch(/\/example\/dailies$/);
  });

  it('uses an absolute TEAMAN_VAULT as the content root', async () => {
    const { contentRoot, notesRoot } = await load('/tmp/my-vault');
    expect(contentRoot).toBe('/tmp/my-vault');
    expect(notesRoot.replace(/\\/g, '/')).toBe('/tmp/my-vault/notes');
  });

  it('resolves a relative TEAMAN_VAULT to an absolute path', async () => {
    const { contentRoot } = await load('some/vault');
    expect(isAbsolute(contentRoot)).toBe(true);
    expect(contentRoot.replace(/\\/g, '/')).toMatch(/\/some\/vault$/);
  });
});
