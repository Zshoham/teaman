import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkWikiLink from 'remark-wiki-link';
import { failOnEmbedErrors, remarkWikiEmbeds, remarkWikiLinks } from '../remark-wiki-links.mjs';

let vault;
afterEach(() => {
  if (vault) rmSync(vault, { recursive: true, force: true });
  vault = undefined;
});

async function render(markdown, from) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkWikiLink, { aliasDivider: '|' })
    .use(remarkWikiEmbeds, { vaultDir: vault, base: '/' })
    .use(remarkWikiLinks, { vaultDir: vault, base: '/' })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process({ value: markdown, path: join(vault, from) });
  return String(file);
}

describe('remarkWikiLinks', () => {
  it('links to the resolved page, keeps the alias, and marks misses', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    mkdirSync(join(vault, 'notes', 'sub'), { recursive: true });
    writeFileSync(join(vault, 'notes', 'sub', 'target.md'), '# Target\n');
    writeFileSync(join(vault, 'notes', 'from.md'), '');

    const html = await render('See [[target|the target]] and [[nowhere]].', 'notes/from.md');
    expect(html).toContain('<a class="internal" href="/notes/sub/target/">the target</a>');
    expect(html).toContain('<span class="wiki-link-missing" title="No page named “nowhere”">nowhere</span>');
  });

  it('leaves wiki-link syntax inside code alone', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    const html = await render('`[[no_unique_address]]`', 'notes/from.md');
    expect(html).toContain('<code>[[no_unique_address]]</code>');
  });

  it('embeds the image Obsidian would find, anywhere in the vault', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    mkdirSync(join(vault, 'attachments'), { recursive: true });
    mkdirSync(join(vault, 'notes'), { recursive: true });
    writeFileSync(join(vault, 'attachments', 'Pic One.png'), '');

    const html = await render('Look: ![[pic one.png|The pic]] and ![[Pic One.png|300]].', 'notes/from.md');
    expect(html).toContain('<img src="../attachments/Pic%20One.png" alt="The pic">');
    expect(html).toContain('<img src="../attachments/Pic%20One.png" alt="" width="300">');
    expect(html).toContain('Look: ');
  });

  it('fails on a note embed and on a missing image', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    await expect(render('![[Some Note]]', 'notes/from.md')).rejects.toThrow(/embeds a note/);
    await expect(render('![[gone.png]]', 'notes/from.md')).rejects.toThrow(/no image named “gone.png”/);
  });

  it('leaves embed syntax in code alone', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    const html = await render('`![[Some Note]]`', 'notes/from.md');
    expect(html).toContain('<code>![[Some Note]]</code>');
  });

  it('fails the build after content sync when any file had a bad embed', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-wiki-'));
    await render('![[Another Note]]', 'notes/bad.md').catch(() => {});
    expect(() => failOnEmbedErrors().hooks['astro:build:start']())
      .toThrow(/notes\/bad\.md: !\[\[Another Note\]\] embeds a note/);
  });
});
