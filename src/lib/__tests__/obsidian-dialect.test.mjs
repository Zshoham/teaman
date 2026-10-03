/**
 * The Obsidian dialect case table. The site parses vault Markdown with remark;
 * the PDF, Confluence sync, and doctor share the markdown-it dialect in
 * `obsidian-markdown.mjs`. Every case here runs through both, so a vault reads
 * the same wherever it is rendered.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkWikiLink from 'remark-wiki-link';
import { rehypeFlexibleCallouts } from '../rehype-flexible-callouts.mjs';
import { compileDiagramFences, obsidianDialect, wikiLinks } from '../obsidian-markdown.mjs';
import { remarkFenceSvg, fenceLanguages } from '../remark-fence-svg.mjs';

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

function siteLinks(md) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikiLink, { aliasDivider: '|' });
  const links = [];
  const walk = node => {
    if (node.type === 'wikiLink') links.push([node.value, node.data.alias ?? node.value]);
    node.children?.forEach(walk);
  };
  walk(processor.runSync(processor.parse(md)));
  return links;
}

function siteCallouts(md) {
  const html = String(unified()
    .use(remarkParse).use(remarkGfm)
    .use(remarkRehype).use(rehypeFlexibleCallouts).use(rehypeStringify)
    .processSync(md));
  return [...html.matchAll(/data-callout="([^"]+)" data-collapsible="(true|false)"/g)]
    .map(([, type, collapsible]) => [type, collapsible === 'true']);
}

describe.each(CASES)('$name', ({ md, links, callouts }) => {
  if (links) {
    it('finds the same wiki-links in both parsers', () => {
      expect(wikiLinks(md).map(link => [link.target, link.label])).toEqual(links);
      expect(siteLinks(md)).toEqual(links);
    });
  }
  if (callouts) {
    it('reads the same callouts in both parsers', () => {
      const dialect = dialectCallouts(md);
      expect(dialect.map(([type, fold]) => [type, fold])).toEqual(callouts.map(([type, fold]) => [type, fold]));
      callouts.forEach(([, , title], index) => {
        if (title !== undefined) expect(dialect[index][2]).toBe(title);
      });
      expect(siteCallouts(md)).toEqual(callouts.map(([type, fold]) => [type, fold !== null]));
    });
  }
});

describe('embeds', () => {
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
    const site = unified().use(remarkParse).use(remarkFenceSvg, { cacheDir, compilers });
    const tree = await site.run(site.parse(md));
    const tokens = new MarkdownIt().use(obsidianDialect).parse(md, {});
    const diagrams = await compileDiagramFences(tokens, { languages: fenceLanguages, cacheDir, compilers });
    expect(diagrams.size).toBe(1);
    expect([...diagrams.values()][0].svg).toBe(tree.children[0].value);
    expect(tree.children[0].value).toContain('fill="black"');
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
