import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { COLLECTIONS } from '../collections.mjs';
import { openVaultCatalog } from '../vault-catalog.mjs';

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

const DRAFT = '---\ndraft: true\n---\n# Draft\n';

/** One live and one drafted entry of every type, plus a `_` path. */
function fixture() {
  vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
  write('notes/live.md');
  write('notes/draft.md', DRAFT);
  write('notes/_templates/tpl.md');
  write('references/live.md');
  write('references/draft.md', DRAFT);
  write('references/book/SUMMARY.md', '# Book\n\n- [Intro](intro.md)\n');
  write('references/book/intro.md');
  write('guides/live/SUMMARY.md', '# Live\n\n- [One](one.md)\n- [Two](two.md)\n');
  write('guides/live/one.md');
  write('guides/live/two.md', DRAFT);
  write('guides/draft/SUMMARY.md', `${DRAFT}\n- [Only](only.md)\n`);
  write('guides/draft/only.md');
  write('slides/live.md');
  write('slides/draft.md', DRAFT);
  write('dailies/2026-03-12.md', '---\ndate: 2026-03-12\n---\nhi\n');
  write('dailies/2026-03-13.md', '---\ndate: 2026-03-13\ndraft: true\n---\nhi\n');
  write('decisions/adr-0001.md', '---\ntitle: Live\n---\n');
  write('decisions/adr-0002.md', '---\ntitle: Draft\ndraft: true\n---\n');
  return openVaultCatalog(vault);
}

const ids = records => records.map(record => record.id);

describe('openVaultCatalog', () => {
  it('publishes no draft and no _ path, for every type', () => {
    const catalog = fixture();
    for (const { type } of COLLECTIONS) {
      for (const record of catalog.published(type)) {
        expect(record.data.draft, `${type} ${record.id}`).not.toBe(true);
        expect(record.relPath, `${type} ${record.id}`).not.toMatch(/(^|\/)_/);
      }
      expect(catalog.all(type).length, type).toBeGreaterThan(catalog.published(type).length);
    }
  });

  it('keeps drafts in the all view, flagged', () => {
    const catalog = fixture();
    expect(ids(catalog.published('note'))).toEqual(['live']);
    expect(catalog.all('note').map(note => [note.id, note.published])).toEqual([
      ['_templates/tpl', false],
      ['draft', false],
      ['live', true],
    ]);
    expect(ids(catalog.published('slides'))).toEqual(['live']);
    expect(ids(catalog.published('daily'))).toEqual(['2026-03-12']);
    expect(catalog.published('decision').map(record => record.num)).toEqual(['0001']);
    expect(ids(catalog.published('reference'))).toEqual(['book', 'live']);
  });

  it('drops drafted guide chapters, and hides a drafted guide whole', () => {
    const catalog = fixture();
    const [live] = catalog.published('guide');
    expect(ids(catalog.published('guide'))).toEqual(['live']);
    expect(live.chapters.map(chapter => chapter.path)).toEqual(['one.md']);
    const draft = catalog.all('guide').find(guide => guide.id === 'draft');
    expect(draft.chapters.map(chapter => chapter.published)).toEqual([false]);
  });

  it('reports guide chapters the site cannot serve', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('guides/g/SUMMARY.md', '- [Here](here.md)\n- [Gone](gone.md)\n- [Out](../elsewhere.md)\n');
    write('guides/g/here.md');
    write('guides/elsewhere.md');
    const [guide] = openVaultCatalog(vault).all('guide');
    expect(guide.chapters.map(chapter => chapter.path)).toEqual(['here.md']);
    expect(guide.missing).toEqual(['gone.md']);
    expect(guide.invalid).toEqual(['../elsewhere.md']);
  });

  it('records unreadable frontmatter as an error, never published', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('notes/broken.md', '---\ntitle: [unclosed\n---\n# Broken\n');
    const [broken] = openVaultCatalog(vault).all('note');
    expect(broken.error).toMatch(/frontmatter is not valid YAML/);
    expect(broken.published).toBe(false);
  });

  it('resolves a relative vault path, so records and lookups agree', () => {
    fixture();
    const catalog = openVaultCatalog(relative(process.cwd(), vault));
    expect(catalog.vaultDir).toBe(vault);
    expect(catalog.published('note').map(note => note.sourcePath)).toEqual([join(vault, 'notes/live.md')]);
    expect(catalog.isPublishedFile(join(vault, 'notes/live.md'))).toBe(true);
    expect(catalog.isPublishedFile(join(vault, 'dailies/2026-03-12.md'))).toBe(true);
  });

  it('knows which files are parts of published pages', () => {
    const catalog = fixture();
    const published = path => catalog.isPublishedFile(join(vault, path));
    expect(published('notes/live.md')).toBe(true);
    expect(published('guides/live/one.md')).toBe(true);
    expect(published('references/book/intro.md')).toBe(true);
    for (const path of [
      'notes/draft.md',
      'notes/_templates/tpl.md',
      'guides/live/SUMMARY.md',
      'guides/live/two.md',
      'guides/draft/only.md',
      'references/book/SUMMARY.md',
      'slides/draft.md',
    ]) {
      expect(published(path), path).toBe(false);
    }
  });
});
