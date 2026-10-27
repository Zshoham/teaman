import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {
  assembleReferenceBook,
  layoutReferenceBook,
  prepareReferenceChapter,
  referenceChapterAnchor,
} from '../reference-book.mjs';
import { renderReferenceTypst } from '../reference-pdf.mjs';
import { remarkReferenceBooks } from '../remark-reference-books.mjs';

const BOOK = [
  {
    path: 'intro.md',
    title: 'Introduction',
    body: [
      '# Introduction',
      '',
      'See [setup](guide/setup.md#configuration), [the guide](guide/setup.md),',
      '[a rule](guide/setup.md#r-setup.valid), [the title](guide/setup.md#setting-up), and [below](#overview).',
      '',
      '## Overview',
      '',
      '## Overview',
    ].join('\n'),
    sourcePath: '/v/references/book/intro.md',
  },
  {
    path: 'guide/setup.md',
    title: 'Setup',
    body: '# Setting up\n\n## Configuration\n\n<span id="knob"></span>\n\nr[setup.valid]\n',
    sourcePath: '/v/references/book/guide/setup.md',
  },
  { path: 'foo-bar.md', title: 'Hyphen', body: '# Hyphen\n', sourcePath: '/v/references/book/foo-bar.md' },
  { path: 'foo_bar.md', title: 'Underscore', body: '# Underscore\n\n[back](foo-bar.md)\n', sourcePath: '/v/references/book/foo_bar.md' },
];

const typstLabel = id => `teaman-${Buffer.from(id, 'utf8').toString('hex')}`;

describe('one reference book, both renderers', () => {
  const { body } = assembleReferenceBook(BOOK);
  const html = String(unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkReferenceBooks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(body));
  const { typst } = renderReferenceTypst({ template: '', title: 'Book', body: '', chapters: BOOK, sourcePath: '/v/references/book/SUMMARY.md', vaultDir: '/v' });

  const siteIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const siteLinks = [...html.matchAll(/href="#([^"]+)"/g)].map(match => decodeURIComponent(match[1]));

  it('declares the same ids on the page and in the PDF', () => {
    expect(siteIds).toEqual([
      'intro', 'intro--overview', 'intro--overview-1',
      'guide--setup', 'guide--setup--configuration', 'guide--setup--knob', 'r-setup.valid',
      'foo-bar', 'foo-bar--2',
    ]);
    for (const id of siteIds) expect(typst, id).toContain(`<${typstLabel(id)}>`);
  });

  it('lands every link between chapters on a declared id, in both', () => {
    expect(siteLinks).toEqual([
      'guide--setup--configuration', 'guide--setup', 'r-setup.valid', 'guide--setup', 'intro--overview', 'foo-bar',
    ]);
    for (const link of siteLinks) {
      expect(siteIds).toContain(link);
      expect(typst, link).toContain(`#link(<${typstLabel(link)}>)`);
    }
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
