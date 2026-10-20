import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { bookProblems, isSummaryFile, parseSummary, readBook } from '../books.mjs';

const roots = [];
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
});

function book(files) {
  const root = mkdtempSync(join(tmpdir(), 'teaman-book-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe('parseSummary', () => {
  it('parses an mdBook SUMMARY in order and preserves chapter nesting', () => {
    expect(parseSummary([
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
    expect(parseSummary([
      '- [**Introduction**](intro.md "Start here")',
      '- [Appendix](<appendix (draft).md> "Work in progress")',
    ].join('\n'))).toEqual([
      { title: 'Introduction', path: 'intro.md', depth: 0 },
      { title: 'Appendix', path: 'appendix (draft).md', depth: 0 },
    ]);
  });

  it('takes one nesting level from the SUMMARY rather than assuming four spaces', () => {
    expect(parseSummary([
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
    expect(parseSummary([
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
    expect(parseSummary('- [A](a.md)\n - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
    ]);
    expect(parseSummary('1. [A](a.md)\n  - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
    ]);
    expect(parseSummary('1. [A](a.md)\n   - [B](b.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 1 },
    ]);
    expect(parseSummary('10. [A](a.md)\n   - [B](b.md)\n\n10. [C](c.md)\n    - [D](d.md)')).toEqual([
      { title: 'A', path: 'a.md', depth: 0 },
      { title: 'B', path: 'b.md', depth: 0 },
      { title: 'C', path: 'c.md', depth: 0 },
      { title: 'D', path: 'd.md', depth: 1 },
    ]);
  });
});

// Guides' SUMMARY.md goes through the same CommonMark parser; these spellings
// were dropped by the line regex guides used to carry.
describe('parseSummary chapter spellings', () => {
  const paths = (source, options = { rootRelative: true }) => parseSummary(source, options).map(chapter => chapter.path);

  it('accepts every list marker, indented items, and ./ or / prefixes', () => {
    expect(paths('# G\n* [A](a.md)\n+ [B](b.md)\n1. [C](c.md)\n  - [D](./d.md)\n- [E](/e.md)\n'))
      .toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
  });

  it('reads titled, angle-bracket, and percent-encoded destinations, and drops fragments', () => {
    expect(parseSummary('- [A](a.md "The first bit")\n', { rootRelative: true })).toEqual([{ title: 'A', path: 'a.md', depth: 0 }]);
    expect(paths('- [A](<my chapter.md>)\n- [B](my%20other.md)\n- [C](part-one/c.md#section)\n'))
      .toEqual(['my chapter.md', 'my other.md', 'part-one/c.md']);
  });

  it('ignores external links, non-Markdown targets, and links in prose', () => {
    expect(paths([
      '# G',
      'See [Prose](prose.md) for context.',
      '',
      '- [Site](https://example.com/x.md)',
      '- [Proto](//example.com/x.md)',
      '- [Asset](diagram.svg)',
      '- [Real](a.md)',
    ].join('\n'))).toEqual(['a.md']);
  });

  it('handles Windows line endings and a title-only summary', () => {
    expect(paths('# Guide\r\n- [Intro](intro.md)\r\n')).toEqual(['intro.md']);
    expect(paths('# Title\n')).toEqual([]);
  });
});

describe('parseSummary root-relative targets', () => {
  // A reference book resolves chapters against its own directory and guards
  // against escaping it, so a leading `/` is meaningless there. Guides have
  // always accepted that spelling, and opt in.
  it('rejects /chapter.md by default', () => {
    expect(parseSummary('- [A](/a.md)\n')).toEqual([]);
  });

  it('accepts and strips the slash when rootRelative is set', () => {
    expect(parseSummary('- [A](/a.md)\n', { rootRelative: true }))
      .toEqual([{ title: 'A', path: 'a.md', depth: 0 }]);
  });

  it('still rejects protocol-relative URLs when rootRelative is set', () => {
    expect(parseSummary('- [A](//host/a.md)\n', { rootRelative: true })).toEqual([]);
  });
});

describe('readBook', () => {
  it('lists existing chapters in order, once each, and reports the rest', () => {
    const root = book({
      'b/SUMMARY.md': '---\ntitle: B\n---\n# Book\n\n- [One](one.md)\n- [Again](./one.md)\n- [Gone](gone.md)\n- [Out](../out.md)\n- [Two](sub/two.md)\n',
      'b/one.md': '# One',
      'b/sub/two.md': '# Two',
      'out.md': '# Out',
    });
    const read = readBook(join(root, 'b', 'SUMMARY.md'));
    expect(read.data).toEqual({ title: 'B' });
    expect(read.chapters.map(chapter => [chapter.path, chapter.title, chapter.sourcePath]))
      .toEqual([['one.md', 'One', join(root, 'b', 'one.md')], ['sub/two.md', 'Two', join(root, 'b', 'sub', 'two.md')]]);
    expect(read.missing).toEqual(['gone.md']);
    expect(read.invalid).toEqual(['../out.md']);
  });

  it('takes /chapter.md only when the book allows it', () => {
    const root = book({ 'g/SUMMARY.md': '- [A](/a.md)\n', 'g/a.md': '# A' });
    expect(readBook(join(root, 'g', 'SUMMARY.md')).chapters).toEqual([]);
    expect(readBook(join(root, 'g', 'SUMMARY.md'), { rootRelative: true }).chapters.map(chapter => chapter.path)).toEqual(['a.md']);
  });
});

describe('bookProblems', () => {
  it('states what keeps a book from building', () => {
    expect(bookProblems({ id: 'b', kind: 'book', chapters: [], missing: ['x.md'], invalid: ['../y.md'] })).toEqual([
      'b/SUMMARY.md lists no Markdown chapters',
      'b/SUMMARY.md points at missing chapter x.md',
      'b/SUMMARY.md points outside its directory (../y.md)',
    ]);
    // A guide (no `kind`) may be empty; an unusable SUMMARY is the only problem reported.
    expect(bookProblems({ id: 'g', chapters: [], missing: [], invalid: [] })).toEqual([]);
    expect(bookProblems({ error: 'ambiguous', missing: ['x.md'] })).toEqual(['ambiguous']);
  });
});

describe('isSummaryFile', () => {
  it('matches SUMMARY.md in any case', () => {
    expect(['SUMMARY.md', 'a/summary.md', 'Summary.MD'].map(isSummaryFile)).toEqual([true, true, true]);
    expect(isSummaryFile('summary-notes.md')).toBe(false);
  });
});
