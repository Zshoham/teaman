/**
 * The Obsidian dialect case table. The site parses vault Markdown with remark;
 * the PDF, Confluence sync, and doctor share the markdown-it dialect in
 * `obsidian-markdown.mjs`. Every case here runs through both, so a vault reads
 * the same wherever it is rendered; the embed cases run through each renderer
 * and doctor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { createSiteMarkdownRenderer } from '../site-markdown.mjs';
import { compileDiagramFences, fenceLanguage, obsidianDialect, wikiLinks } from '../obsidian-markdown.mjs';
import { createVaultIndex } from '../vault-index.mjs';
import { remarkDiagramFences } from '../remark-fence-svg.mjs';
import { BUILD_DIAGRAM_LANGUAGES, diagramKind } from '../diagram-kinds.mjs';
import { prepareReferenceChapter } from '../reference-book.mjs';

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

// One embed case table, through every renderer: what the site draws, what the
// PDF and Confluence draw, and the refusal they share with doctor.
const EMBED_CASES = [
  { name: 'an image', md: '![[pic.png]]', site: { alt: '' }, alt: 'pic.png' },
  { name: 'a sized image', md: '![[pic.png|300]]', site: { alt: '', width: '300' }, alt: 'pic.png', width: 300 },
  { name: 'a sized image, both ways', md: '![[pic.png|300x200]]', site: { alt: '', width: '300', height: '200' }, alt: 'pic.png', width: 300 },
  { name: 'a captioned image', md: '![[pic.png|A cup]]', site: { alt: 'A cup' }, alt: 'A cup' },
  { name: 'a sized frame', md: '![[viz.html|600]]', frame: { height: '600' }, alt: 'viz.html' },
  { name: 'a captioned frame', md: '![[viz.html|The planets]]', frame: { title: 'The planets' }, alt: 'The planets' },
  { name: 'a note embed', md: '![[Some Note]]', problem: '![[Some Note]] embeds a note, which teaman does not support — link it with [[Some Note]] instead' },
  { name: 'a missing image', md: '![[gone.png|300]]', problem: '![[gone.png]]: no image named “gone.png” in the vault' },
  { name: 'a missing frame', md: '![[gone.html]]', problem: '![[gone.html]]: no HTML file named “gone.html” in the vault' },
];

describe('embeds', () => {
  let embedVault;
  let embedRenderer;
  let index;
  let markdownToTypst;
  let markdownToStorage;
  let lintVault;
  beforeAll(async () => {
    embedVault = join(scratch, 'embed-vault');
    mkdirSync(join(embedVault, 'attachments'), { recursive: true });
    mkdirSync(join(embedVault, 'notes'), { recursive: true });
    writeFileSync(join(embedVault, 'attachments', 'pic.png'), 'png');
    writeFileSync(join(embedVault, 'attachments', 'viz.html'), '<!doctype html>');
    embedRenderer = await createSiteMarkdownRenderer({
      vaultDir: embedVault,
      base: '/',
      engineDir: fileURLToPath(new URL('../../..', import.meta.url)),
      diagramCacheDir: join(scratch, 'diagrams'),
    });
    index = createVaultIndex(embedVault);
    ({ markdownToTypst } = await import('../reference-pdf.mjs'));
    ({ markdownToStorage } = await import('../../../scripts/sync-confluence.mjs'));
    ({ lintVault } = await import('../vault-lint.mjs'));
  });

  const page = () => join(embedVault, 'notes', 'page.md');
  const siteRender = md => embedRenderer.render(md, { fileURL: pathToFileURL(page()) }).then(result => result.code);
  const attrs = (html, tag) => Object.fromEntries(
    [...(html.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
  // Astro hands a Markdown image's attributes to its image pipeline as JSON.
  const image = html => JSON.parse(attrs(html, 'img').__ASTRO_IMAGE_.replaceAll('&#x22;', '"'));

  describe.each(EMBED_CASES)('$name', ({ md, site, frame, alt, width, problem }) => {
    if (problem) {
      it('is refused by the site, the PDF, and Confluence, and reported by doctor, for the same reason', async () => {
        await expect(siteRender(md)).rejects.toThrow(problem);
        expect(() => markdownToTypst(md, { sourcePath: page(), resolveAttachment: index.resolveAttachment })).toThrow(problem);
        expect(() => markdownToStorage(md, { filePath: page(), index })).toThrow(problem);
        writeFileSync(page(), md);
        try {
          expect(lintVault(embedVault).problems).toEqual([`notes: page.md: ${problem}`]);
        } finally {
          rmSync(page());
        }
      });
      return;
    }

    it('draws the file at the same size, with the same caption, everywhere', async () => {
      const html = await siteRender(md);
      if (site) expect(image(html)).toMatchObject({ src: '../attachments/pic.png', ...site });
      if (site && !site.width) expect(image(html)).not.toHaveProperty('width');
      if (frame) expect(attrs(html, 'iframe')).toMatchObject({ src: '/embeds/attachments/viz.html', ...frame });

      const typst = markdownToTypst(md, { sourcePath: page(), resolveAttachment: index.resolveAttachment });
      const storage = markdownToStorage(md, { filePath: page(), index }).html;
      if (site) {
        expect(typst).toContain(`alt: "${alt}"`);
        expect(storage).toContain(`<ac:image ac:alt="${alt}"${width ? ` ac:width="${width}"` : ''}`);
      } else {
        expect(typst).toContain(`Interactive embed: ${alt} —`);
        expect(storage).toContain(`Interactive embed: ${alt} —`);
      }
    });
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

// A fence names its diagram kind the same way in a note, in a reference
// book chapter, and in the markdown-it renderers.
describe.each([
  { info: 'mermaid', kind: 'mermaid' },
  { info: 'Mermaid', kind: 'mermaid' },
  { info: 'TikZ', kind: 'tikz' },
  { info: 'PlantUML extra words', kind: 'plantuml' },
  { info: 'rust,ignore', kind: null },
  { info: 'js', kind: null },
])('a ```$info fence', ({ info, kind }) => {
  const md = `\`\`\`${info}\nsource\n\`\`\``;
  const compilers = { tikz: async () => '<svg><text>tikz</text></svg>' };

  async function remarkKind(markdown) {
    const cacheDir = mkdtempSync(join(tmpdir(), 'teaman-fence-kind-'));
    try {
      const site = unified().use(remarkParse).use(remarkDiagramFences, { cacheDir, compilers });
      // A prepared chapter opens with its chapter marker; find the fence.
      const node = (await site.run(site.parse(markdown))).children
        .find(child => child.type === 'code' || /^<pre class=|content-svg/.test(child.value ?? ''));
      if (node.type === 'code') return null;
      return node.value.match(/^<pre class="(\w+)">/)?.[1] ?? node.value.match(/content-svg (\w+)-svg/)?.[1];
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }

  it('is the same diagram kind (or none) in every renderer', async () => {
    expect(await remarkKind(md)).toBe(kind);
    const [token] = markdownIt.parse(md, {});
    expect(diagramKind(fenceLanguage(token))?.lang ?? null).toBe(kind);
  });

  it('keeps its kind through reference book chapter preparation', async () => {
    expect(await remarkKind(prepareReferenceChapter(md, { path: 'chapter.md' }))).toBe(kind);
  });
});
