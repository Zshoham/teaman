import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { isInside, walkMarkdown } from '../fs-walk.mjs';

describe('isInside', () => {
  it('is true for a descendant and for the root itself', () => {
    expect(isInside('/a/b', '/a/b/c/d.md')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
  });

  it('is false for a parent or a sibling', () => {
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/a/c')).toBe(false);
  });

  // The prefix alone isn't containment: /a/bc is not inside /a/b.
  it('is false for a sibling whose name merely starts with the root name', () => {
    expect(isInside('/a/b', '/a/bc')).toBe(false);
  });

  it('resolves traversal before deciding', () => {
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
    expect(isInside('/a/b', '/a/b/c/../d.md')).toBe(true);
  });
});

describe('walkMarkdown', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'teaman-walk-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel) => {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '# x\n');
  };
  const found = (opts) => walkMarkdown(root, opts).map(p => relative(root, p).replaceAll('\\', '/'));

  it('yields nothing for a missing directory', () => {
    expect(walkMarkdown(join(root, 'nope'))).toEqual([]);
  });

  it('finds .md files recursively', () => {
    write('a.md');
    write('deep/nested/b.md');
    expect(found()).toEqual(['a.md', 'deep/nested/b.md']);
  });

  it('ignores non-markdown files', () => {
    write('a.md');
    write('b.txt');
    write('c.mdx');
    expect(found()).toEqual(['a.md']);
  });

  it('accepts an uppercase extension', () => {
    write('SUMMARY.MD');
    expect(found()).toEqual(['SUMMARY.MD']);
  });

  // Sorted so discovery order — and therefore doctor's output — doesn't depend
  // on the filesystem's readdir order.
  it('sorts by name at each level', () => {
    write('z.md');
    write('a.md');
    write('m/z.md');
    write('m/a.md');
    expect(found()).toEqual(['a.md', 'm/a.md', 'm/z.md', 'z.md']);
  });

  it('keeps _-prefixed paths by default', () => {
    write('_draft.md');
    write('_partials/x.md');
    expect(found()).toEqual(['_draft.md', '_partials/x.md']);
  });

  it('drops _-prefixed files and directories when asked', () => {
    write('_draft.md');
    write('_partials/x.md');
    write('keep.md');
    expect(found({ skipUnderscore: true })).toEqual(['keep.md']);
  });
});
