/**
 * The Obsidian dialect case table. The site parses vault Markdown with remark;
 * the PDF, Confluence sync, and doctor share the markdown-it dialect in
 * `obsidian-markdown.mjs`. Every case here runs through both, so a vault reads
 * the same wherever it is rendered.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { createSiteMarkdownRenderer } from '../site-markdown.mjs';
import { compileDiagramFences, isHtmlEmbed, obsidianDialect, wikiLinks } from '../obsidian-markdown.mjs';
import { remarkDiagramFences } from '../remark-fence-svg.mjs';
import { BUILD_DIAGRAM_LANGUAGES } from '../diagram-kinds.mjs';

const CASES = [
  { name: 'a bare link', md: 'See [[note]].', links: [['note', 'note']] },
  { name: 'a labelled link', md: 'See [[note|the note]].', links: [['note', 'the note']] },
  { name: 'a path-qualified link', md: '[[guides/intro]]', links: [['guides/intro', 'guides/intro']] },
  { name: 'two links on a line', md: '[[a]] and [[b|B]]', links: [['a', 'a'], ['b', 'B']] },
  { name: 'a link with a heading', md: '[[note#Why]]', links: [['note#Why', 'note#Why']] },
  { name: 'a code span', md: 'Use `[[no_unique_address]]` here.', links: [] },
  { name: 'a fenced block', md: '```c\nint a[[x]];\n```', links: [] },
  { name: 'an indented code block', md: '    [[x]]', links: [] },
  { name: 'a link in a table', md: '| a |\n| - |\n| [[x]] |', links: [['x', 'x']] },
  { name: 'a link in a callout', md: '> [!note]\n> see [[x]]', links: [['x', 'x']], callouts: [['note', null]] },
  { name: 'a titled callout', md: '> [!tip] Read *this*\n> body', callouts: [['tip', null, 'Read *this*']] },
  { name: 'a folded callout', md: '> [!warning]- Careful\n> body', callouts: [['warning', '-', 'Careful']] },
  { name: 'an open foldable callout', md: '> [!info]+\n> body', callouts: [['info', '+', '']] },
  { name: 'a vault-defined callout type', md: '> [!EDITION-2018]\n> body', callouts: [['edition-2018', null, '']] },
  { name: 'a callout nested in a quote', md: '> > [!question] Why\n> > body', callouts: [['question', null, 'Why']] },
  { name: 'a plain quote', md: '> just a quote', callouts: [] },
];

const markdownIt = new MarkdownIt({ html: true }).use(obsidianDialect);

function dialectCallouts(md) {
  return markdownIt.parse(md, {})
    .filter(token => token.type === 'blockquote_open' && token.meta?.callout)
    .map(({ meta: { callout } }) => [callout.type, callout.fold, callout.title]);
}

// The site side is the site's real pipeline (`site-markdown.mjs`), rendering a
// note of an empty vault: every wiki-link is then a missing-page span naming
// its target.
let scratch;
let renderer;
beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'teaman-dialect-'));
  mkdirSync(join(scratch, 'vault'));
  renderer = await createSiteMarkdownRenderer({
    vaultDir: join(scratch, 'vault'),
    base: '/',
    engineDir: fileURLToPath(new URL('../../..', import.meta.url)),
    diagramCacheDir: join(scratch, 'diagrams'),
  });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function siteHtml(md) {
  const { code } = await renderer.render(md, { fileURL: pathToFileURL(join(scratch, 'vault', 'notes', 'page.md')) });
  return code;
}

async function siteLinks(md) {
  return [...(await siteHtml(md)).matchAll(/<span class="wiki-link-missing" title="No page named “([^”]*)”">([^<]*)<\/span>/g)]
    .map(([, target, label]) => [target, label]);
}

async function siteCallouts(md) {
  return [...(await siteHtml(md)).matchAll(/data-callout="([^"]+)" data-collapsible="(true|false)"/g)]
    .map(([, type, collapsible]) => [type, collapsible === 'true']);
}

describe.each(CASES)('$name', ({ md, links, callouts }) => {
  if (links) {
    it('finds the same wiki-links in both parsers', async () => {
      expect(wikiLinks(md).map(link => [link.target, link.label])).toEqual(links);
      expect(await siteLinks(md)).toEqual(links);
    });
  }
  if (callouts) {
    it('reads the same callouts in both parsers', async () => {
      const dialect = dialectCallouts(md);
      expect(dialect.map(([type, fold]) => [type, fold])).toEqual(callouts.map(([type, fold]) => [type, fold]));
      callouts.forEach(([, , title], index) => {
        if (title !== undefined) expect(dialect[index][2]).toBe(title);
      });
      expect(await siteCallouts(md)).toEqual(callouts.map(([type, fold]) => [type, fold !== null]));
    });
  }
});

describe('embeds', () => {
  it('tells HTML embeds from images and notes', () => {
    expect(isHtmlEmbed('viz.html')).toBe(true);
    expect(isHtmlEmbed('Viz.HTM#planet=mars')).toBe(true);
    expect(isHtmlEmbed('viz.html.png')).toBe(false);
    expect(isHtmlEmbed('Some Note')).toBe(false);
  });

  it('marks ![[embeds]] and tells images from notes', () => {
    expect(wikiLinks('![[pic.png]] ![[Some Note]]')).toEqual([
      { target: 'pic.png', label: 'pic.png', embed: true },
      { target: 'Some Note', label: 'Some Note', embed: true },
    ]);
  });
});

it('renders D2 fences identically through remark and the shared Markdown dialect', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'teaman-d2-dialect-'));
  const md = '```d2\nclient -> server\n```';
  const compilers = { d2: async () => '<svg><text fill="black">client</text></svg>' };
  try {
    const site = unified().use(remarkParse).use(remarkDiagramFences, { cacheDir, compilers });
    const tree = await site.run(site.parse(md));
    const tokens = new MarkdownIt().use(obsidianDialect).parse(md, {});
    const diagrams = await compileDiagramFences(tokens, { languages: BUILD_DIAGRAM_LANGUAGES, cacheDir, compilers });
    expect(diagrams.size).toBe(1);
    expect([...diagrams.values()][0].svg).toBe(tree.children[0].value);
    expect(tree.children[0].value).toContain('fill="black"');
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
