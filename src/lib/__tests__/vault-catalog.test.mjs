import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

  // The guides collection drops a trailing `/index`; the chapter's URL
  // segment is its id within the guide.
  it('gives each guide chapter its collection id and its slug in the guide', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('guides/g/SUMMARY.md', '- [Start](index.md)\n- [Setup](setup/index.md)\n- [More](<More Info.md>)\n');
    write('guides/g/index.md');
    write('guides/g/setup/index.md');
    write('guides/g/More Info.md');
    const [guide] = openVaultCatalog(vault).published('guide');
    expect(guide.chapters.map(chapter => [chapter.id, chapter.slug])).toEqual([
      ['g', 'index'],
      ['g/setup', 'setup'],
      ['g/more-info', 'more-info'],
    ]);
  });

  it('drafts a reference book chapter as it drafts a guide chapter', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('references/book/SUMMARY.md', '# Book\n\n- [One](one.md)\n- [Two](two.md)\n- [Scratch](_scratch.md)\n');
    write('references/book/one.md', '# One\n\nkept\n');
    write('references/book/two.md', `${DRAFT}\nhidden\n`);
    write('references/book/_scratch.md', '# Scratch\n\nhidden\n');
    const catalog = openVaultCatalog(vault);
    const [book] = catalog.published('reference');
    expect(book.chapters.map(chapter => chapter.path)).toEqual(['one.md']);
    expect(book.body).toContain('kept');
    expect(book.body).not.toContain('hidden');
    expect(catalog.all('reference')[0].chapters.map(chapter => chapter.published)).toEqual([true, false, false]);
    expect(catalog.isPublishedFile(join(vault, 'references/book/two.md'))).toBe(false);
    expect(catalog.isPublishedFile(join(vault, 'references/book/_scratch.md'))).toBe(false);
  });

  it('records unreadable reference frontmatter as an error naming the file', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('references/broken.md', '---\ntitle: [unclosed\n---\n# Broken\n');
    write('references/book/SUMMARY.md', '---\ntitle: [unclosed\n---\n- [One](one.md)\n');
    write('references/book/one.md');
    write('references/other/SUMMARY.md', '- [One](one.md)\n');
    write('references/other/one.md', '---\ntitle: [unclosed\n---\n');
    const catalog = openVaultCatalog(vault);
    const [book, broken, other] = catalog.all('reference');
    expect(book.error).toMatch(/^book\/SUMMARY\.md: frontmatter is not valid YAML/);
    expect(broken.error).toMatch(/^broken\.md: frontmatter is not valid YAML/);
    expect(other.chapters[0]).toMatchObject({ published: false, error: expect.stringMatching(/not valid YAML/) });
    expect(catalog.published('reference').map(record => record.id)).toEqual(['other']);
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

  it('records unreadable ADR and deck frontmatter as an error instead of throwing', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('decisions/adr-0007-x.md', '---\ntitle: [unclosed\n---\n');
    write('slides/talk.md', '---\ntitle: [unclosed\n---\n# One\n');
    const catalog = openVaultCatalog(vault);
    for (const type of ['decision', 'slides']) {
      const [broken] = catalog.all(type);
      expect(broken.error, type).toMatch(/frontmatter is not valid YAML/);
      expect(broken.published, type).toBe(false);
    }
    expect(catalog.all('decision')[0].num).toBe('0007');
  });

  // On a case-insensitive filesystem SUMMARY.md can name `Intro.md` for the
  // walked `intro.md`; a symlink reproduces that split here (walks skip it,
  // readBook follows it).
  it('reads a chapter SUMMARY.md spells differently from the walk', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('guides/g/SUMMARY.md', '- [One](one.md)\n- [Intro](Intro.md)\n');
    write('guides/g/one.md');
    write('guides/g/intro.md', DRAFT);
    symlinkSync('intro.md', join(vault, 'guides/g/Intro.md'));
    const [guide] = openVaultCatalog(vault).published('guide');
    expect(guide.chapters.map(chapter => chapter.path)).toEqual(['one.md']);
  });

  // Astro's glob loaders never see a dot path, so the site never renders one.
  it('ignores dot-prefixed files and folders, as the collections do', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('notes/live.md');
    write('notes/.archive/old.md');
    write('notes/.hidden.md');
    write('guides/.wip/foo/SUMMARY.md', '- [One](one.md)\n');
    write('guides/.wip/foo/one.md');
    write('slides/.drafts/talk.md');
    write('decisions/.old/adr-0001.md');
    const catalog = openVaultCatalog(vault);
    expect(ids(catalog.all('note'))).toEqual(['live']);
    expect(catalog.all('guide')).toEqual([]);
    expect(catalog.all('slides')).toEqual([]);
    expect(catalog.all('decision')).toEqual([]);
    expect(catalog.isPublishedFile(join(vault, 'notes/.archive/old.md'))).toBe(false);
  });

  // The guideSummaries collection globs `**/SUMMARY.md`, exactly.
  it('finds a guide only by a SUMMARY.md spelled exactly', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('guides/upper/SUMMARY.md', '- [One](one.md)\n');
    write('guides/upper/one.md');
    write('guides/lower/summary.md', '- [One](one.md)\n');
    write('guides/lower/one.md');
    expect(ids(openVaultCatalog(vault).all('guide'))).toEqual(['upper']);
  });

  it('reads each file once, shared by the entries and the files view', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-catalog-'));
    write('guides/g/SUMMARY.md', '- [One](one.md)\n');
    write('guides/g/one.md', '---\ntitle: One\n---\n');
    write('guides/g/unlisted.md');
    const catalog = openVaultCatalog(vault);
    expect(catalog.files('guide').map(file => file.relPath)).toEqual(['g/one.md', 'g/SUMMARY.md', 'g/unlisted.md']);
    expect(catalog.files('guide')).toBe(catalog.files('guide'));
    expect(catalog.all('guide')[0].chapters[0].data).toEqual({ title: 'One' });
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
