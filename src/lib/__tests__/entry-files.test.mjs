import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readEntryFile, readEntryFiles, yamlError } from '../entry-files.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function write(path, content) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

describe('readEntryFile', () => {
  it('reads the id, path, frontmatter, and body', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-entry-files-'));
    const path = write('Team/My Note.md', '---\ntitle: Hi\nslug: custom\n---\nBody\n');
    expect(readEntryFile('note', root, path)).toEqual({
      id: 'custom',
      sourcePath: path,
      relPath: 'Team/My Note.md',
      data: { title: 'Hi', slug: 'custom' },
      body: 'Body\n',
    });
  });

  it('reports unreadable frontmatter with its path-derived id', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-entry-files-'));
    const path = write('broken.md', '---\ntitle: [unclosed\n---\n');
    expect(readEntryFile('note', root, path)).toMatchObject({ id: 'broken', relPath: 'broken.md', data: {}, body: '' });
    expect(readEntryFile('note', root, path).error).toMatch(/^frontmatter is not valid YAML \(.+\)$/);
  });

  // gray-matter's own cache would hand back an empty, error-free result.
  it('reports the same broken frontmatter every time it is read', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-entry-files-'));
    const first = write('one.md', '---\nkey: [same broken\n---\n');
    const second = write('two.md', '---\nkey: [same broken\n---\n');
    expect(readEntryFile('note', root, first).error).toBeDefined();
    expect(readEntryFile('note', root, second).error).toBeDefined();
    expect(readEntryFile('note', root, first).error).toBeDefined();
  });
});

describe('readEntryFiles', () => {
  it('reads every Markdown file, _ paths included and dot paths not', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-entry-files-'));
    write('a.md', '# A\n');
    write('_drafts/b.md', '# B\n');
    write('.archive/c.md', '# C\n');
    expect(readEntryFiles('note', root).map(file => file.relPath)).toEqual(['_drafts/b.md', 'a.md']);
  });
});

describe('yamlError', () => {
  it('keeps only the first line of the parser message', () => {
    expect(yamlError(new Error('bad indentation\n  at line 2'))).toBe('frontmatter is not valid YAML (bad indentation)');
  });
});
