import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createVaultIndex } from '../vault-index.mjs';

let vault;
afterEach(() => {
  if (vault) rmSync(vault, { recursive: true, force: true });
  vault = undefined;
});

function write(path, content = '# x\n') {
  const full = join(vault, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function fixture() {
  vault = mkdtempSync(join(tmpdir(), 'teaman-vault-'));
  write('notes/top.md');
  write('notes/Shipping Cadence.md');
  write('notes/sub/nested.md');
  write('notes/sub/intro.md');
  write('notes/renamed.md', '---\nslug: custom\n---\n# Renamed\n');
  write('notes/hidden.md', '---\ndraft: true\n---\n# Hidden\n');
  write('references/standalone.md');
  write('references/book/SUMMARY.md', '# Book\n\n- [Intro](intro.md)\n- [Deep](deep.md)\n');
  write('references/book/intro.md');
  write('references/book/deep.md');
  write('guides/using-it/SUMMARY.md', '# Using it\n\n- [Intro](intro.md)\n- [Setup](<Setup Steps.md>)\n');
  write('guides/using-it/intro.md');
  write('guides/using-it/Setup Steps.md');
  write('guides/using-it/unlisted.md');
  write('slides/talk.md');
  write('slides/_wip.md');
  write('dailies/2026-03-12.md', '---\ndate: 2026-03-12\n---\nhi\n');
  write('decisions/adr-0002.md', '---\ntitle: T\n---\n');
  return createVaultIndex(vault, { base: '/site/' });
}

const hrefOf = (index, target, from) => index.resolve(target, from && join(vault, from))?.href ?? null;

describe('createVaultIndex', () => {
  it('links every rendered type to where the site shows it', () => {
    const index = fixture();
    expect(hrefOf(index, 'top')).toBe('/site/notes/top/');
    expect(hrefOf(index, 'nested')).toBe('/site/notes/sub/nested/');
    expect(hrefOf(index, 'renamed')).toBe('/site/notes/custom/');
    expect(hrefOf(index, 'standalone')).toBe('/site/references/standalone/');
    expect(hrefOf(index, 'deep')).toBe('/site/references/book/#deep');
    expect(hrefOf(index, 'using-it')).toBe('/site/guides/using-it/');
    expect(hrefOf(index, 'Setup Steps')).toBe('/site/guides/using-it/setup-steps/');
    expect(hrefOf(index, 'talk')).toBe('/site/slides/talk/');
    expect(hrefOf(index, '2026-03-12')).toBe('/site/daily/2026-03-08/#day-2026-03-12');
    expect(hrefOf(index, 'adr-0002')).toBe('/site/decisions/?adr=0002');
  });

  it('leaves unpublished files unresolved', () => {
    const index = fixture();
    for (const target of ['hidden', 'SUMMARY', 'unlisted', '_wip', 'nope']) {
      expect(index.resolve(target), target).toBeNull();
    }
  });

  it('applies the publish rule to every type', () => {
    const index = fixture();
    write('notes/_templates/tpl.md');
    write('decisions/adr-0003.md', '---\ntitle: T\ndraft: true\n---\n');
    write('dailies/_scratch/2026-03-13.md', '---\ndate: 2026-03-13\n---\n');
    write('guides/hidden/SUMMARY.md', '---\ndraft: true\n---\n- [Only](only.md)\n');
    write('guides/hidden/only.md');
    const fresh = createVaultIndex(vault, { base: '/site/' });
    for (const target of ['tpl', 'adr-0003', '2026-03-13', 'hidden', 'only']) {
      expect(fresh.resolve(target), target).toBeNull();
    }
    expect(index.resolve('top')).not.toBeNull();
  });

  it('serves the first published chapter at the guide root', () => {
    fixture();
    write('guides/using-it/intro.md', '---\ndraft: true\n---\n');
    const index = createVaultIndex(vault, { base: '/site/' });
    expect(index.resolve('intro', join(vault, 'guides/using-it/unlisted.md'))?.entry.type).not.toBe('guide');
    expect(hrefOf(index, 'Setup Steps')).toBe('/site/guides/using-it/');
  });

  it('matches names case-insensitively, with or without .md', () => {
    const index = fixture();
    expect(hrefOf(index, 'TOP')).toBe('/site/notes/top/');
    expect(hrefOf(index, 'shipping cadence.md')).toBe('/site/notes/shipping-cadence/');
    expect(index.resolve('Shipping Cadence').via).toBe('obsidian');
  });

  it('falls back to the legacy slug comparison and says so', () => {
    const index = fixture();
    const resolution = index.resolve('shipping-cadence');
    expect(resolution.href).toBe('/site/notes/shipping-cadence/');
    expect(resolution.via).toBe('slug');
  });

  it('prefers the linking file’s folder, then the shortest path, and reports the rest', () => {
    const index = fixture();
    const fromNotes = index.resolve('intro', join(vault, 'notes/sub/nested.md'));
    expect(fromNotes.href).toBe('/site/notes/sub/intro/');
    expect(fromNotes.alternatives.map(entry => entry.path).sort()).toEqual([
      'guides/using-it/intro',
      'references/book/intro',
    ]);
    expect(hrefOf(index, 'intro', 'guides/using-it/unlisted.md')).toBe('/site/guides/using-it/');
    // No folder match: the shortest path wins.
    expect(index.resolve('intro', join(vault, 'notes/top.md')).entry.path).toBe('notes/sub/intro');
  });

  it('resolves a path-qualified link by any trailing run of segments', () => {
    const index = fixture();
    expect(hrefOf(index, 'references/book/intro')).toBe('/site/references/book/#intro');
    expect(hrefOf(index, 'book/intro')).toBe('/site/references/book/#intro');
    expect(hrefOf(index, 'using-it/intro')).toBe('/site/guides/using-it/');
    expect(index.resolve('other/intro')).toBeNull();
  });

  it('drops a heading fragment and flags it', () => {
    const index = fixture();
    const resolution = index.resolve('top#Some Heading');
    expect(resolution.href).toBe('/site/notes/top/');
    expect(resolution.fragment).toBe(true);
    expect(hrefOf(index, '#Heading', 'notes/top.md')).toBe('/site/notes/top/');
  });
});
