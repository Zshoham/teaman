import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assetPath, assetRoots, resolveVaultAsset } from '../vault-assets.mjs';

let vault;
let engine;
const write = path => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'x');
  return path;
};

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'teaman-assets-'));
  engine = mkdtempSync(join(tmpdir(), 'teaman-engine-'));
});
afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
  rmSync(engine, { recursive: true, force: true });
});

describe('resolveVaultAsset', () => {
  const resolveFrom = (url, fromFile = join(vault, 'notes/page.md')) =>
    resolveVaultAsset(url, { fromFile, roots: assetRoots(vault, { engineDir: engine }) });

  it('tries the note\'s directory, then the vault root, then the public roots', () => {
    const publicCopy = write(join(vault, 'public/img/a.png'));
    expect(resolveFrom('img/a.png')).toBe(publicCopy);
    const vaultCopy = write(join(vault, 'img/a.png'));
    expect(resolveFrom('img/a.png')).toBe(vaultCopy);
    const noteCopy = write(join(vault, 'notes/img/a.png'));
    expect(resolveFrom('img/a.png')).toBe(noteCopy);
  });

  it('looks a site-root path up in the roots only, vault first', () => {
    write(join(vault, 'notes/logo.svg'));
    const engineCopy = write(join(engine, 'resources/public/logo.svg'));
    expect(resolveFrom('/logo.svg')).toBe(engineCopy);
    const vaultCopy = write(join(vault, 'logo.svg'));
    expect(resolveFrom('/logo.svg')).toBe(vaultCopy);
  });

  it('decodes the path and drops its query and fragment', () => {
    const file = write(join(vault, 'notes/my image#1.png'));
    expect(resolveFrom('my%20image%231.png?v=2#top')).toBe(file);
    expect(assetPath('a%2')).toBe('a%2');
  });

  it('resolves nothing remote, fragment-only, or missing', () => {
    for (const url of ['https://x.dev/a.png', '//cdn/a.png', 'data:image/png;base64,', '#top', '', 'gone.png']) {
      expect(resolveFrom(url), url).toBeNull();
    }
  });

  it('ignores a directory of the same name', () => {
    mkdirSync(join(vault, 'notes/img.png'), { recursive: true });
    expect(resolveFrom('img.png')).toBeNull();
  });
});
