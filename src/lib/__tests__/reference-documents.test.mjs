import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverReferenceDocuments,
  parseReferenceSummary,
  prepareReferenceChapter,
  referenceChapterAnchor,
} from '../reference-documents.mjs';

const roots = [];
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'teaman-reference-documents-'));
  roots.push(root);
  return root;
}

describe('reference document discovery', () => {
  it('parses an mdBook SUMMARY in order and preserves chapter nesting', () => {
    expect(parseReferenceSummary([
      '# A book',
      '[Introduction](intro.md)',
      '- [Items](items.md)',
      '    - [Functions](items/functions.md#ignored)',
      '- [External](https://example.com/x.md)',
    ].join('\n'))).toEqual([
      { title: 'Introduction', path: 'intro.md', depth: 0 },
      { title: 'Items', path: 'items.md', depth: 0 },
      { title: 'Functions', path: 'items/functions.md', depth: 1 },
    ]);
  });

  it('uses parsed CommonMark destinations for titled and formatted SUMMARY links', () => {
    expect(parseReferenceSummary([
      '- [**Introduction**](intro.md "Start here")',
      '- [Appendix](<appendix (draft).md> "Work in progress")',
    ].join('\n'))).toEqual([
      { title: 'Introduction', path: 'intro.md', depth: 0 },
      { title: 'Appendix', path: 'appendix (draft).md', depth: 0 },
    ]);
  });

  it('takes one nesting level from the SUMMARY rather than assuming four spaces', () => {
    expect(parseReferenceSummary([
      '- [Items](items.md)',
      '  - [Functions](items/functions.md)',
      '    - [Parameters](items/params.md)',
    ].join('\n'))).toEqual([
      { title: 'Items', path: 'items.md', depth: 0 },
      { title: 'Functions', path: 'items/functions.md', depth: 1 },
      { title: 'Parameters', path: 'items/params.md', depth: 2 },
    ]);
  });

  it('derives depth per branch when SUMMARY indentation widths are mixed', () => {
    expect(parseReferenceSummary([
      '- [First](first.md)',
      '    - [First child](first/child.md)',
      '- [Second](second.md)',
      '  - [Second child](second/child.md)',
    ].join('\n'))).toEqual([
      { title: 'First', path: 'first.md', depth: 0 },
      { title: 'First child', path: 'first/child.md', depth: 1 },
      { title: 'Second', path: 'second.md', depth: 0 },
      { title: 'Second child', path: 'second/child.md', depth: 1 },
    ]);
  });

  it('uses CommonMark marker widths to distinguish padding from nesting', () => {
    expect(parseReferenceSummary('- [A](a.md)\n - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
    ]);
    expect(parseReferenceSummary('1. [A](a.md)\n  - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
    ]);
    expect(parseReferenceSummary('1. [A](a.md)\n   - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 1 },
    ]);
    expect(parseReferenceSummary('10. [A](a.md)\n   - [B](b.md)\n\n10. [C](c.md)\n    - [D](d.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
      { title: 'C', path: 'c.md', depth: 0 },
      { title: 'D', path: 'd.md', depth: 1 },
    ]);
  });

  it('falls back to the first heading when frontmatter carries a valueless title', () => {
    const root = fixture();
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'book', 'SUMMARY.md'), '---\ntitle:\n---\n# Real title\n\n- [Chapter](chapter.md)\n');
    writeFileSync(join(root, 'book', 'chapter.md'), '# Chapter\n');
    const [book] = discoverReferenceDocuments(root);
    expect(book.data.title).toBe('Real title');
  });

  it('exposes a SUMMARY directory as one document while keeping standalone files compatible', () => {
    const root = fixture();
    mkdirSync(join(root, 'language', 'items'), { recursive: true });
    writeFileSync(join(root, 'standalone.md'), '---\ntitle: One file\n---\n# One file\n\nBody.\n');
    writeFileSync(join(root, 'language', 'SUMMARY.md'), [
      '---',
      'summary: The whole language.',
      'tags: [language]',
      '---',
      '# Language reference',
      '[Introduction](intro.md)',
      '    - [Items](items/index.md)',
    ].join('\n'));
    writeFileSync(join(root, 'language', 'intro.md'), '# Introduction\n\nr[intro.rule]\n\nHello.\n');
    writeFileSync(join(root, 'language', 'items', 'index.md'), '# Items\n\n## Syntax\n\n```rust,ignore\nfn main() {}\n```\n');
    writeFileSync(join(root, 'language', 'unlisted.md'), '# Not included\n');

    const documents = discoverReferenceDocuments(root);
    expect(documents.map(document => [document.id, document.kind])).toEqual([
      ['language', 'book'],
      ['standalone', 'standalone'],
    ]);
    const book = documents[0];
    expect(book.title).toBe('Language reference');
    expect(book.data).toMatchObject({
      title: 'Language reference',
      summary: 'The whole language.',
      tags: ['language'],
    });
    expect(book.chapters.map(chapter => chapter.path)).toEqual(['intro.md', 'items/index.md']);
    expect(book.body).toContain('## Introduction');
    expect(book.body).toContain('### Items');
    expect(book.body).toContain('#### Syntax');
    expect(book.body).toContain('<a id="r-intro.rule"');
    expect(book.body).toContain('```rust\nfn main() {}');
    expect(book.body).not.toContain('Not included');
  });

  it('reports missing listed chapters for doctor and the PDF build', () => {
    const root = fixture();
    mkdirSync(join(root, 'broken'));
    writeFileSync(join(root, 'broken', 'SUMMARY.md'), '# Broken\n\n- [Gone](gone.md)\n');
    const [book] = discoverReferenceDocuments(root);
    expect(book.chapters).toEqual([]);
    expect(book.missing).toEqual(['gone.md']);
  });

  it('does not let a SUMMARY include chapters outside its book directory', () => {
    const root = fixture();
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'outside.md'), '# Outside\n');
    writeFileSync(join(root, 'book', 'SUMMARY.md'), '# Book\n\n- [Outside](../outside.md)\n');
    const book = discoverReferenceDocuments(root).find(document => document.id === 'book');
    expect(book.chapters).toEqual([]);
    expect(book.invalid).toEqual(['../outside.md']);
  });

  it('reports a standalone/book URL collision', () => {
    const root = fixture();
    mkdirSync(join(root, 'system'));
    writeFileSync(join(root, 'system.md'), '# Standalone\n');
    writeFileSync(join(root, 'system', 'SUMMARY.md'), '# Book\n\n- [Chapter](chapter.md)\n');
    writeFileSync(join(root, 'system', 'chapter.md'), '# Chapter\n');
    const duplicates = discoverReferenceDocuments(root).filter(document => document.id === 'system');
    expect(duplicates).toHaveLength(2);
    expect(duplicates.some(document => document.error?.includes('duplicate reference id'))).toBe(true);
  });

  it('assigns distinct anchors when different chapter paths have the same readable slug', () => {
    const root = fixture();
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'book', 'SUMMARY.md'), [
      '# Book',
      '',
      '- [Hyphen](foo-bar.md)',
      '- [Underscore](foo_bar.md)',
    ].join('\n'));
    writeFileSync(join(root, 'book', 'foo-bar.md'), '# Hyphen\n');
    writeFileSync(join(root, 'book', 'foo_bar.md'), '# Underscore\n');

    const [book] = discoverReferenceDocuments(root);
    expect(book.chapters.map(chapter => chapter.anchor)).toEqual(['foo-bar', 'foo-bar--2']);
    expect(new Set(book.chapters.map(chapter => chapter.anchor)).size).toBe(2);
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
