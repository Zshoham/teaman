import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readMarkdownSource } from '../markdown-source';
import { sourceHref } from '../entry-identity.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function file(name: string, text: string) {
  const dir = await mkdtemp(join(tmpdir(), 'teaman-source-'));
  directories.push(dir);
  const path = join(dir, name);
  await writeFile(path, text);
  return path;
}

describe('Markdown source', () => {
  it('preserves original frontmatter, CRLF, and unprocessed Obsidian syntax', async () => {
    const original = '---\r\ntitle: "Example"\r\n---\r\n# Title\r\n[[Other]]\r\n<script>alert(1)</script>\r\n';
    const filePath = await file('note.md', original);
    expect(await readMarkdownSource({ filePath })).toBe(original);
  });

  it('links nested source ids under a site base and escapes special characters', () => {
    expect(sourceHref('/vault/', 'notes', 'nested/my #note'))
      .toBe('/vault/source/notes/nested/my%20%23note.md');
  });
});
