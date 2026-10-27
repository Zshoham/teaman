import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { discoverReferenceDocuments } from '../reference-documents.mjs';

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
  it('falls back to the first heading when frontmatter carries a valueless title', () => {
    const root = fixture();
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'book', 'SUMMARY.md'), '---\ntitle:\n---\n# Real title\n\n- [Chapter](chapter.md)\n');
    writeFileSync(join(root, 'book', 'chapter.md'), '# Chapter\n');
    const [book] = discoverReferenceDocuments(root);
    expect(book.data.title).toBe('Real title');
  });

  // The fallback is filled in before the schema runs: a null title must not
  // turn the rest of the frontmatter back into what was written.
  it('normalizes frontmatter whose title is valueless, for a standalone reference and a book', () => {
    const root = fixture();
    mkdirSync(join(root, 'book'));
    writeFileSync(join(root, 'standalone.md'), '---\ntitle:\ntags: a, b\n---\n# Standalone\n');
    writeFileSync(join(root, 'book', 'SUMMARY.md'), '---\ntitle:\ntags: a, b\n---\n# Book\n\n- [One](one.md)\n');
    writeFileSync(join(root, 'book', 'one.md'), '# One\n');
    for (const document of discoverReferenceDocuments(root)) {
      expect(document.issues, document.id).toEqual([]);
      expect(document.data.tags, document.id).toEqual(['a', 'b']);
      expect(document.data.title, document.id).toBe(document.title);
    }
  });

  it('names references with the site entry id', () => {
    const root = fixture();
    mkdirSync(join(root, 'Rust Book'), { recursive: true });
    writeFileSync(join(root, 'Rust Book', 'SUMMARY.md'), '# Rust\n\n- [Intro](intro.md)\n');
    writeFileSync(join(root, 'Rust Book', 'intro.md'), '# Intro\n');
    writeFileSync(join(root, 'My Ref.md'), '# Mine\n');
    writeFileSync(join(root, 'renamed.md'), '---\nslug: custom\n---\n# Renamed\n');

    expect(discoverReferenceDocuments(root).map(document => document.id)).toEqual([
      'custom', 'my-ref', 'rust-book',
    ]);
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
