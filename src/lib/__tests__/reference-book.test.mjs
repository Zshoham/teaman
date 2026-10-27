/**
 * One reference book through the real path: discovery (the catalog), then the
 * site's own Markdown pipeline (`site-markdown.mjs`, rendering the book's
 * body as its SUMMARY.md, as the reference loader does) and the PDF stage
 * (`buildReferences`, with a compiler that keeps the Typst). Ids, links between
 * chapters, and wiki-links have to land the same in both.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assembleReferenceBook,
  layoutReferenceBook,
  prepareReferenceChapter,
  referenceChapterAnchor,
} from '../reference-book.mjs';
import { createSiteMarkdownRenderer } from '../site-markdown.mjs';
import { openVaultCatalog } from '../vault-catalog.mjs';
import { buildReferences } from '../../../scripts/build-references.mjs';

const engineDir = fileURLToPath(new URL('../../..', import.meta.url));

const BOOK = {
  'SUMMARY.md': [
    '# Book',
    '',
    '- [Introduction](intro.md)',
    '- [Setup](guide/setup.md)',
    '- [Overview](overview.md)',
    '- [Guide overview](guide/overview.md)',
    '- [Hyphen](foo-bar.md)',
    '- [Underscore](foo_bar.md)',
  ].join('\n'),
  'intro.md': [
    '# Introduction',
    '',
    'See [setup](guide/setup.md#configuration), [the guide](guide/setup.md),',
    '[a rule](guide/setup.md#r-setup.valid), [the title](guide/setup.md#setting-up), and [below](#overview).',
    '',
    '## Overview',
    '',
    '## Overview',
  ].join('\n'),
  // `[[overview]]` names two chapters; Obsidian takes the one beside the
  // linking chapter, not the one beside SUMMARY.md.
  'guide/setup.md': '# Setting up\n\n## Configuration\n\n<span id="knob"></span>\n\nr[setup.valid]\n\nRead [[overview]].\n',
  'overview.md': '# Overview\n',
  'guide/overview.md': '# Guide overview\n',
  'foo-bar.md': '# Hyphen\n',
  'foo_bar.md': '# Underscore\n\n[back](foo-bar.md)\n',
};

const typstLabel = id => `teaman-${Buffer.from(id, 'utf8').toString('hex')}`;

describe('one reference book, both renderers', () => {
  let scratch;
  let html;
  let typst;

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'teaman-reference-book-'));
    const vault = join(scratch, 'vault');
    for (const [path, content] of Object.entries(BOOK)) {
      const file = join(vault, 'references', 'book', path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const catalog = openVaultCatalog(vault);
    const [book] = catalog.published('reference');

    const renderer = await createSiteMarkdownRenderer({
      vaultDir: vault,
      base: '/',
      engineDir,
      diagramCacheDir: join(scratch, 'diagrams'),
    });
    ({ code: html } = await renderer.render(book.body, { fileURL: pathToFileURL(book.sourcePath) }));

    await buildReferences({
      catalog,
      outDir: join(scratch, 'out'),
      template: '',
      diagramCacheDir: join(scratch, 'diagrams'),
      pdfCacheDir: join(scratch, 'pdfs'),
      createCompiler: () => ({
        pdf: ({ mainFileContent }) => (typst = mainFileContent, new Uint8Array()),
        evictCache: () => {},
      }),
      log: () => {},
    });
  });

  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const siteIds = () => [...html.matchAll(/<(?!section)\w+[^>]*\sid="([^"]+)"/g)].map(match => match[1]);
  // Links written in the chapters, not the permalinks the site adds to headings.
  const siteLinks = () => [...html.matchAll(/<a (?![^>]*heading-anchor)[^>]*href="#([^"]+)"/g)]
    .map(match => decodeURIComponent(match[1]));

  it('declares the same ids on the page and in the PDF', () => {
    expect(siteIds()).toEqual([
      'intro', 'intro--overview', 'intro--overview-1',
      'guide--setup', 'guide--setup--configuration', 'guide--setup--knob', 'r-setup.valid',
      'overview', 'guide--overview',
      'foo-bar', 'foo-bar--2',
    ]);
    for (const id of siteIds()) expect(typst, id).toContain(`<${typstLabel(id)}>`);
  });

  it('lands every link between chapters on a declared id, in both', () => {
    expect(siteLinks()).toEqual([
      'guide--setup--configuration', 'guide--setup', 'r-setup.valid', 'guide--setup', 'intro--overview', 'foo-bar',
    ]);
    for (const link of siteLinks()) {
      expect(siteIds()).toContain(link);
      expect(typst, link).toContain(`#link(<${typstLabel(link)}>)`);
    }
  });

  it('resolves a wiki-link from the chapter it is written in, in both', () => {
    expect(html).toContain('<a class="internal" href="/references/book/#guide--overview">overview</a>');
    expect(typst).toContain(`#link(<${typstLabel('guide--overview')}>)[#text("overview")]`);
  });
});

describe('layoutReferenceBook', () => {
  it('numbers repeated headings as mdBook does, the title taking a slot', () => {
    const layout = layoutReferenceBook([{ path: 'a.md', anchor: 'a', headings: ['If', 'If', 'Else'] }]);
    expect(layout.headingIds('a.md')).toEqual(['a', 'a--if-1', 'a--else']);
    expect(layout.rewrite('#if', 'a.md')).toBe('#a');
    expect(layout.rewrite('#if-1', 'a.md')).toBe('#a--if-1');
  });

  it('leaves external, out-of-book, and undeclared extensionless links alone', () => {
    const layout = layoutReferenceBook([{ path: 'a.md', anchor: 'a', headings: [] }]);
    for (const url of ['https://x.dev/a.md', '/abs.md', '../out.md', 'release-notes', 'img.png']) {
      expect(layout.rewrite(url, 'a.md')).toBe(url);
    }
    expect(layout.rewrite('img/a%23b.png', 'sub/a.md', { image: true })).toBe('sub/img/a%23b.png');
  });
});

describe('reference chapter preparation', () => {
  it('does not reinterpret headings or rule labels inside fenced code', () => {
    const body = prepareReferenceChapter([
      '# Chapter',
      '```text,ignore',
      '# code heading',
      'r[not.an.anchor]',
      '```',
    ].join('\n'), { path: 'nested/chapter.md', title: 'Chapter', depth: 1 });

    expect(referenceChapterAnchor('nested/chapter.md')).toBe('nested--chapter');
    expect(body).toContain('### Chapter');
    expect(body).toContain('```text\n# code heading\nr[not.an.anchor]\n```');
    expect(body).not.toContain('r-not.an.anchor');
  });

  it('demotes a setext title instead of adding a second one', () => {
    const body = prepareReferenceChapter([
      'Chapter',
      '=======',
      '',
      'Body.',
      '',
      'Not a heading',
      '',
      '=== still not a heading',
    ].join('\n'), { path: 'chapter.md', title: 'Chapter' });

    expect(body).toContain('## Chapter');
    expect(body).not.toContain('=======');
    expect(body.match(/^## Chapter$/gm)).toHaveLength(1);
    expect(body).toContain('=== still not a heading');
  });

  it('demotes level-two setext sections along with their chapter', () => {
    const body = prepareReferenceChapter([
      '# Chapter',
      '',
      'Section',
      '-------',
      '',
      'Body.',
    ].join('\n'), { path: 'chapter.md', title: 'Chapter', depth: 1 });

    expect(body).toContain('### Chapter');
    expect(body).toContain('#### Section');
    expect(body).not.toContain('-------');
  });

  it('emits link targets for productions in generic grammar fences', () => {
    const body = prepareReferenceChapter([
      '# Syntax',
      '',
      '```grammar',
      '@root Document -> Block*',
      '',
      'Block -> `text`',
      '```',
    ].join('\n'), { path: 'syntax.md', title: 'Syntax' });

    expect(body).toContain('<a id="grammar-Document"');
    expect(body).toContain('<a id="grammar-Block"');
    expect(body).toContain('```text\n@root Document -> Block*');
    expect(body.indexOf('grammar-Document')).toBeLessThan(body.indexOf('```text'));
  });

  it('normalizes mdBook test annotations on blockquoted Rust fences', () => {
    const body = prepareReferenceChapter([
      '# Chapter',
      '> ```rust,edition2024,compile_fail',
      '> let type = 1;',
      '> ```',
      '',
      '  ```compile_fail',
      '  let type = 1;',
      '  ```',
    ].join('\n'), { path: 'chapter.md', title: 'Chapter' });

    expect(body).toContain('> ```rust\n> let type = 1;');
    expect(body).toContain('  ```rust\n  let type = 1;');
  });
});
