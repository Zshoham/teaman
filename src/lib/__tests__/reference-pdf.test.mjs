import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

import {
  markdownToTypst,
  referencePdfCacheKey,
  renderReferenceDocument,
  renderReferenceTypst,
  resolveReferenceImage,
} from '../reference-pdf.mjs';
import { createVaultIndex } from '../vault-index.mjs';
import { assembleReferenceBook } from '../reference-book.mjs';
import { createReferenceCompiler } from '../typst-packages.mjs';

const template = readFileSync(
  fileURLToPath(new URL('../../../resources/reference-template.typ', import.meta.url)),
  'utf8',
);

// A book's chapters as reference discovery hands them to the PDF.
const assembled = chapters => assembleReferenceBook(chapters).chapters;

// A standalone reference as the catalog publishes it, rendered with an index
// that resolves nothing.
function renderStandalone(body, options) {
  const document = { id: 'r', title: 'R', kind: 'standalone', data: {}, body, sourcePath: '/tmp/vault/references/r.md' };
  return renderReferenceDocument(document, {
    template,
    vaultDir: '/tmp/vault',
    index: { resolve: () => null, resolveAttachment: () => null },
    ...options,
  });
}

describe('reference PDF rendering', () => {
  it('converts common Markdown structures and removes a duplicate leading title', () => {
    const typst = markdownToTypst(`# Title\n\n## Overview\n\nHello **world**.\n\n- one\n- two\n\n\`code\``);
    expect(typst).not.toContain('Title');
    expect(typst).toContain('= #text("Overview")');
    expect(typst).toContain('#strong[');
    expect(typst).toContain('- #text("one")');
    expect(typst).toContain('#raw("code")');
  });

  it('turns same-document fragments into links to labelled PDF headings and HTML anchors', () => {
    const typst = markdownToTypst([
      '# Title',
      '',
      '[Jump to details](#details) and [use the legacy name](#legacy).',
      '',
      '## Details',
      '',
      '<a id="legacy"></a>',
      '',
      '[External](https://example.com/docs#details)',
    ].join('\n'));
    const headingLabel = typst.match(/= #text\("Details"\) <([^>]+)>/)?.[1];
    const legacyLabel = typst.match(/#metadata\(none\) <([^>]+)>/)?.[1];

    expect(headingLabel).toBeTruthy();
    expect(legacyLabel).toBeTruthy();
    expect(typst).toContain(`#link(<${headingLabel}>)[#text("Jump to details")]`);
    expect(typst).toContain(`#link(<${legacyLabel}>)[#text("use the legacy name")]`);
    expect(typst).toContain('#link("https://example.com/docs#details")');
    expect(typst).not.toContain('#link("#details")');
  });

  it('rewrites local and cross-chapter book links to destinations in the assembled PDF', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'Linked book',
      body: '',
      chapters: assembled([
        {
          path: 'intro.md',
          title: 'Introduction',
          depth: 0,
          body: [
            '# Introduction',
            '',
            '[Local](#overview), [details](nested/details.md#configuration),',
            '[whole chapter](nested/details.md), and [rule](nested/details.md#r-details.rule).',
            '',
            '## Overview',
          ].join('\n'),
          sourcePath: '/tmp/vault/references/book/intro.md',
        },
        {
          path: 'nested/details.md',
          title: 'Details',
          depth: 0,
          body: '# Details\n\n## Configuration\n\nr[details.rule]\n',
          sourcePath: '/tmp/vault/references/book/nested/details.md',
        },
      ]),
      sourcePath: '/tmp/vault/references/book/SUMMARY.md',
      vaultDir: '/tmp/vault',
    });

    expect(source.match(/#link\(<teaman-/g)).toHaveLength(4);
    expect(source).not.toContain('nested/details.md');
    expect(source).not.toContain('#link("#');
    const pdf = createReferenceCompiler().pdf({ mainFileContent: source });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('resolves declared rule and grammar-production links inside a book PDF', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'Language guide',
      body: '',
      chapters: assembled([{
        path: 'syntax.md',
        title: 'Syntax',
        depth: 0,
        body: [
          '# Syntax',
          '',
          '[Production](#grammar-Document) and [rule][document rule].',
          '',
          '```grammar',
          '@root Document -> Block*',
          'Block -> `text`',
          '```',
          '',
          'r[document.valid]',
          '',
          '[document rule]: document.valid',
        ].join('\n'),
        sourcePath: '/tmp/vault/references/guide/syntax.md',
      }]),
      sourcePath: '/tmp/vault/references/guide/SUMMARY.md',
      vaultDir: '/tmp/vault',
    });

    expect(source.match(/#link\(<teaman-/g)).toHaveLength(2);
    expect(source).not.toContain('#link("document.valid")');
    expect(source).not.toContain('#link("#grammar-Document")');
    const pdf = createReferenceCompiler().pdf({ mainFileContent: source });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('uses collision-disambiguated chapter anchors in PDF labels and links', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'Colliding paths',
      body: '',
      chapters: assembled([
        {
          path: 'foo-bar.md',
          title: 'Hyphen',
          depth: 0,
          body: '# Hyphen\n',
          sourcePath: '/tmp/vault/references/book/foo-bar.md',
        },
        {
          path: 'foo_bar.md',
          title: 'Underscore',
          depth: 0,
          body: '# Underscore\n',
          sourcePath: '/tmp/vault/references/book/foo_bar.md',
        },
        {
          path: 'links.md',
          title: 'Links',
          depth: 0,
          body: '# Links\n\n[Hyphen](foo-bar.md) and [underscore](foo_bar.md).\n',
          sourcePath: '/tmp/vault/references/book/links.md',
        },
      ]),
      sourcePath: '/tmp/vault/references/book/SUMMARY.md',
      vaultDir: '/tmp/vault',
    });
    const first = `teaman-${Buffer.from('foo-bar').toString('hex')}`;
    const second = `teaman-${Buffer.from('foo-bar--2').toString('hex')}`;

    expect(source).toContain(`#link(<${first}>)`);
    expect(source).toContain(`#link(<${second}>)`);
    expect(first).not.toBe(second);
  });

  it('emits tables as structure only, leaving their design to the template', () => {
    const typst = markdownToTypst('| Label | Meaning |\n| --- | --- |\n| Rule | A constraint |');

    expect(typst).toContain('#table(columns: 2, table.header(');
    // Inset and strokes belong to the template's `set table` / `show table`
    // rules — emitting them here would silently override the printed design.
    expect(typst).not.toContain('inset:');
    expect(typst).not.toContain('stroke:');
  });

  it('renders Obsidian admonitions with their type, title, and inline body markup', () => {
    const typst = markdownToTypst([
      '> [!important] Preserve the seam',
      '> Keep **every** build stage isolated.',
      '',
      '> [!warning]-',
      '> This collapsed callout is expanded in print.',
    ].join('\n'));

    expect(typst).toContain('#teaman-callout(type: "important"');
    expect(typst).toContain('#text("Preserve the seam")');
    expect(typst).toContain('#strong[#text("every")]');
    expect(typst).toContain('#teaman-callout(type: "warning"');
    expect(typst).toContain('#text("Warning")');
    expect(typst).not.toContain('[!important]');
    expect(typst).not.toContain('[!warning]');
  });

  it('leaves wiki-link syntax inside code alone', () => {
    const typst = markdownToTypst('Use `[[no_unique_address]]`.\n\n```c\nint a[[x]];\n```');
    expect(typst).toContain('#raw("[[no_unique_address]]")');
    expect(typst).toContain('int a[[x]];');
  });

  it('links wiki-links into this document and marks the rest unlinked', () => {
    const typst = markdownToTypst('## Here\n\nSee [[here|this section]], [[elsewhere]], and [[nowhere]].', {
      resolveWikiLink: target => ({ here: 'here', elsewhere: 'not-in-this-pdf' })[target] ?? null,
    });
    expect(typst).toMatch(/#link\(<teaman-[0-9a-f]+>\)\[#text\("this section"\)\]/);
    expect(typst).toContain('#teaman-wiki-unlinked[#text("elsewhere")]');
    expect(typst).toContain('#teaman-wiki-unlinked[#text("nowhere")]');
  });

  it('fails on a note embed', () => {
    expect(() => markdownToTypst('![[Some Note]]', { sourcePath: '/v/references/r.md' }))
      .toThrow('/v/references/r.md: ![[Some Note]] embeds a note');
  });

  it('leaves a labelled box where an HTML embed sits', () => {
    const resolveAttachment = target => `/v/attachments/${target}`;
    expect(markdownToTypst('![[solar-system.html|The planets]]', { sourcePath: '/v/references/r.md', resolveAttachment }))
      .toContain('#text("Interactive embed: The planets — open the online version to use it")');
  });

  it('finds an embedded image anywhere in the vault', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'Embeds',
      body: '![[pic.png|A picture]]',
      sourcePath: '/tmp/vault/references/embeds.md',
      vaultDir: '/tmp/vault',
      resolveAttachment: target => (target === 'pic.png' ? '/tmp/vault/attachments/pic.png' : null),
    });
    expect(source).toContain('#image("attachments/pic.png", width: 100%, alt: "A picture")');
  });

  it('compiles both wiki-link styles through the bundled template', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'Links',
      body: '## Target\n\nSee [[target]] and [[missing]].',
      sourcePath: '/tmp/vault/references/links.md',
      vaultDir: '/tmp/vault',
      resolveWikiLink: target => (target === 'target' ? 'target' : null),
    });
    expect(source).toContain('#teaman-wiki-unlinked');
    const pdf = createReferenceCompiler().pdf({ mainFileContent: source });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('embeds compiled diagram SVGs and keeps a visible source fallback on failure', async () => {
    const diagramCacheDir = mkdtempSync(join(tmpdir(), 'teaman-reference-fallback-'));
    const warn = vi.fn();
    try {
      const { typst } = await renderStandalone([
        '```mermaid',
        'flowchart LR\nA-->B',
        '```',
        '',
        '```plantuml',
        '@startuml\nA -> B\n@enduml',
        '```',
      ].join('\n'), {
        diagramCacheDir,
        warn,
        compilers: {
          mermaid: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>',
          plantuml: async () => { throw new Error('bad diagram'); },
        },
      });

      expect(typst).toContain('#image.decode(bytes("<svg');
      expect(typst).not.toContain('flowchart LR');
      expect(typst).toContain('PlantUML diagram could not be rendered');
      expect(typst).toContain('@startuml');
      expect(warn).toHaveBeenCalledWith('[teaman] plantuml reference diagram failed to compile: bad diagram');
    } finally {
      rmSync(diagramCacheDir, { recursive: true, force: true });
    }
  });

  it('compiles each supported diagram fence once', async () => {
    const diagramCacheDir = mkdtempSync(join(tmpdir(), 'teaman-reference-diagrams-'));
    const compilers = Object.fromEntries(
      ['mermaid', 'plantuml', 'tikz', 'typst', 'd2'].map(language => [
        language,
        vi.fn(async source => `<svg xmlns="http://www.w3.org/2000/svg"><text>${language}:${source}</text></svg>`),
      ]),
    );
    try {
      const { typst } = await renderStandalone([
        '```mermaid',
        'A-->B',
        '```',
        '```mermaid',
        'A-->B',
        '```',
        '```plantuml',
        'A -> B',
        '```',
        '```tikz',
        '\\draw (0,0);',
        '```',
        '```typst',
        '$ x^2 $',
        '```',
        '```d2',
        'client -> server',
        '```',
      ].join('\n'), { diagramCacheDir, compilers });

      for (const compile of Object.values(compilers)) expect(compile).toHaveBeenCalledTimes(1);
      expect(typst.match(/#image\.decode/g)).toHaveLength(6);
    } finally {
      rmSync(diagramCacheDir, { recursive: true, force: true });
    }
  });

  it('jumps within the PDF for a wiki-link to a part of this reference only', async () => {
    const document = {
      id: 'book', title: 'Book', kind: 'standalone', data: {}, sourcePath: '/tmp/vault/references/book.md',
      body: '## Target\n\n[[here]] [[other]] [[nowhere]]',
    };
    const entries = { here: { reference: 'book', anchor: 'target' }, other: { reference: 'elsewhere', anchor: 'target' } };
    const { typst } = await renderReferenceDocument(document, {
      template,
      vaultDir: '/tmp/vault',
      index: { resolve: target => (entries[target] ? { entry: entries[target] } : null), resolveAttachment: () => null },
      diagramCacheDir: '/tmp/unused',
    });
    expect(typst).toMatch(/#link\(<teaman-[0-9a-f]+>\)\[#text\("here"\)\]/);
    expect(typst).toContain('#teaman-wiki-unlinked[#text("other")]');
    expect(typst).toContain('#teaman-wiki-unlinked[#text("nowhere")]');
  });

  it('carries real TikZ, Typst and D2 fence SVGs through to the final PDF', async () => {
    const diagramCacheDir = mkdtempSync(join(tmpdir(), 'teaman-reference-real-diagrams-'));
    const body = [
      '## Generated diagrams',
      '',
      '```tikz',
      '\\begin{tikzpicture}\\draw (0,0) circle (0.5);\\end{tikzpicture}',
      '```',
      '',
      '```typst',
      '$ x^2 + 1 $',
      '```',
      '',
      '```d2',
      'client -> server',
      '```',
    ].join('\n');
    try {
      const { typst: source } = await renderStandalone(body, { diagramCacheDir });
      expect(source.match(/#image\.decode/g)).toHaveLength(3);
      const pdf = createReferenceCompiler().pdf({ mainFileContent: source });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      rmSync(diagramCacheDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('fills the bundled template and compiles a real PDF', () => {
    const { typst: source } = renderReferenceTypst({
      template,
      title: 'System reference',
      summary: 'A durable system map.',
      date: new Date('2026-08-01T00:00:00Z'),
      tags: ['systems'],
      brand: 'vault.test',
      body: '## Overview\n\nA paragraph.\n\n> [!important]\n> Preserve the environment seam.\n\n### Details\n\n| A | B |\n| --- | --- |\n| one | two |',
      sourcePath: '/tmp/vault/references/system.md',
      vaultDir: '/tmp/vault',
    });
    const pdf = createReferenceCompiler().pdf({ mainFileContent: source });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it('resolves note-relative and public images without leaving the vault', () => {
    const vault = mkdtempSync(join(tmpdir(), 'teaman-reference-pdf-'));
    try {
      const sourcePath = join(vault, 'references', 'system.md');
      const local = join(vault, 'references', 'diagram.svg');
      const publicImage = join(vault, 'public', 'hero.png');
      mkdirSync(join(vault, 'references'), { recursive: true });
      mkdirSync(join(vault, 'public'), { recursive: true });
      writeFileSync(local, '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="black"/></svg>');
      writeFileSync(publicImage, 'png');

      expect(resolveReferenceImage('diagram.svg', { sourcePath, vaultDir: vault }))
        .toBe('references/diagram.svg');
      expect(resolveReferenceImage('/hero.png', { sourcePath, vaultDir: vault }))
        .toBe('public/hero.png');
      expect(resolveReferenceImage('../../outside.png', { sourcePath, vaultDir: vault }))
        .toBeNull();

      const { typst: source } = renderReferenceTypst({
        template,
        title: 'Reference with image',
        body: '## Diagram\n\n![[diagram.svg|System diagram]]',
        sourcePath,
        vaultDir: vault,
        resolveAttachment: createVaultIndex(vault).resolveAttachment,
      });
      const pdf = createReferenceCompiler(vault).pdf({ mainFileContent: source });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('resolves each assembled book image relative to its own chapter', () => {
    const vault = mkdtempSync(join(tmpdir(), 'teaman-reference-book-pdf-'));
    try {
      const book = join(vault, 'references', 'language');
      const chapterDir = join(book, 'nested');
      const sourcePath = join(chapterDir, 'chapter.md');
      mkdirSync(chapterDir, { recursive: true });
      writeFileSync(join(chapterDir, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');

      const { typst: source } = renderReferenceTypst({
        template,
        title: 'Language reference',
        body: '',
        chapters: assembled([{
          path: 'nested/chapter.md',
          title: 'Chapter',
          depth: 0,
          body: '# Chapter\n\n![Diagram](diagram.svg)\n',
          sourcePath,
        }]),
        sourcePath: join(book, 'SUMMARY.md'),
        vaultDir: vault,
      });
      expect(source).toContain('references/language/nested/diagram.svg');
      const pdf = createReferenceCompiler(vault).pdf({ mainFileContent: source });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe('referencePdfCacheKey', () => {
  const render = (vault, body) => renderReferenceTypst({
    template: '',
    title: 'T',
    body,
    sourcePath: join(vault, 'references', 'r.md'),
    vaultDir: vault,
  });

  it('changes with the Typst source and is stable for identical input', () => {
    const vault = mkdtempSync(join(tmpdir(), 'teaman-key-'));
    try {
      expect(referencePdfCacheKey(render(vault, 'a'), vault)).toBe(referencePdfCacheKey(render(vault, 'a'), vault));
      expect(referencePdfCacheKey(render(vault, 'a'), vault)).not.toBe(referencePdfCacheKey(render(vault, 'b'), vault));
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('tracks the bytes of the images the render names, which the source only names by path', () => {
    const vault = mkdtempSync(join(tmpdir(), 'teaman-key-'));
    try {
      mkdirSync(join(vault, 'references'), { recursive: true });
      const image = join(vault, 'references', 'chart.png');
      writeFileSync(image, 'first');
      const rendered = render(vault, '![Chart](chart.png)');
      expect(rendered.images).toEqual(['references/chart.png']);
      const before = referencePdfCacheKey(rendered, vault);
      writeFileSync(image, 'second');
      expect(referencePdfCacheKey(rendered, vault)).not.toBe(before);

      // An image that cannot be read must not throw — the renderer already
      // degrades those to a placeholder box rather than failing the build.
      rmSync(image);
      expect(referencePdfCacheKey(rendered, vault)).toEqual(expect.any(String));
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
