import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { createVaultIndex } from '../../src/lib/vault-index.mjs';
import { buildLinkTitles, folderPagePlan, markdownToStorage, pageStorage, parseArgs } from '../sync-confluence.mjs';

const confluenceEnv = [
  'CONFLUENCE_BASE_URL',
  'CONFLUENCE_USER',
  'CONFLUENCE_TOKEN',
  'CONFLUENCE_PAT',
  'CONFLUENCE_ROOTS',
  'CONFLUENCE_SPACE',
  'CONFLUENCE_TIMEOUT_MS',
  'CONFLUENCE_MERMAID_MACRO',
  'CONFLUENCE_PLANTUML_MACRO',
  'CONFLUENCE_SVG_MACRO',
];

const originalEnv = new Map();

beforeEach(() => {
  for (const key of confluenceEnv) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of confluenceEnv) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
});

// An index stand-in: one page, and attachments wherever `attachments` says.
const indexOf = ({ pages = {}, attachments = () => null } = {}) => ({
  resolve: target => (pages[target] ? { entry: { title: pages[target] } } : null),
  resolveAttachment: attachments,
});
const cadenceIndex = indexOf({ pages: { 'shipping-cadence': 'Shipping Cadence' } });

describe('sync-confluence markdown rendering', () => {
  it('removes a duplicate leading H1 from storage body', async () => {
    const markdown = '---\ntitle: Vault Static Site Architecture\ntags: [architecture]\n---\n\n# Vault Static Site Architecture\n\nIntro paragraph.';

    expect((await pageStorage(markdown)).html).toBe('<p>Intro paragraph.</p>');
  });

  it('renders markdown tables with the markdown parser instead of treating them as paragraphs', () => {
    const { html } = markdownToStorage('| Convention | Meaning |\n|---|---|\n| `_*.md` | Draft deck |');

    expect(html).toContain('<table>');
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<th>Convention</th>');
    expect(html).toContain('<code>_*.md</code>');
  });

  it('keeps wrapped list continuation text inside the list item', () => {
    const { html } = markdownToStorage('* There were drinks\n* We sat together for a while to think about how to progress the agenda of their\n  most efficient thoughts');

    expect(html).toContain('<ul>');
    expect(html).toContain('We sat together for a while to think about how to progress the agenda of their\nmost efficient thoughts');
    expect(html).not.toContain('</li>\n<p>most efficient thoughts</p>');
  });

  it('keeps Confluence code macros for fenced code blocks and annotates the language', () => {
    const { html } = markdownToStorage('```\nalpha\n]]>\nomega\n```');

    expect(html).toBe('<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">none</ac:parameter><ac:plain-text-body><![CDATA[alpha\n]]]]><![CDATA[>\nomega]]></ac:plain-text-body></ac:structured-macro>');
  });

  it('maps common language aliases for the code macro', () => {
    const { html } = markdownToStorage('```js\nconst x = 1;\n```');

    expect(html).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>');
  });

  it('maps compiled-language aliases onto Confluence code macro values', () => {
    const cases = [
      ['c', 'cpp'],
      ['c++', 'cpp'],
      ['rs', 'rust'],
      ['golang', 'go'],
      ['cpp', 'cpp'],
      ['rust', 'rust'],
      ['go', 'go'],
    ];
    for (const [fence, expected] of cases) {
      const { html } = markdownToStorage(`\`\`\`${fence}\nx\n\`\`\``);
      expect(html).toContain(`<ac:parameter ac:name="language">${expected}</ac:parameter>`);
    }
  });

  it('escapes XML metacharacters in the code macro language parameter', () => {
    const { html } = markdownToStorage('```c&d\nx\n```');

    expect(html).toContain('<ac:parameter ac:name="language">c&amp;d</ac:parameter>');
  });

  it('renders mermaid/plantuml fences as a labeled code block by default', () => {
    const { html } = markdownToStorage('```mermaid\ngraph TD; A-->B;\n```');

    expect(html).toContain('<ac:parameter ac:name="title">Mermaid diagram (source)</ac:parameter>');
    expect(html).toContain('graph TD; A-->B;');
  });

  it('emits a native diagram macro when a mermaid macro name is configured', () => {
    const { html } = markdownToStorage('```mermaid\ngraph TD; A-->B;\n```', { macros: { mermaid: 'mermaid-cloud' } });

    expect(html).toBe('<ac:structured-macro ac:name="mermaid-cloud"><ac:plain-text-body><![CDATA[graph TD; A-->B;]]></ac:plain-text-body></ac:structured-macro>');
  });

  it('resolves wiki-links to Confluence page links by title, and guesses a title otherwise', () => {
    const { html } = markdownToStorage('See [[shipping-cadence|the cadence guide]] and [[missing-note]].', { index: cadenceIndex });

    expect(html).toContain('<ac:link><ri:page ri:content-title="Shipping Cadence" /><ac:plain-text-link-body><![CDATA[the cadence guide]]></ac:plain-text-link-body></ac:link>');
    expect(html).toContain('<ac:link><ri:page ri:content-title="Missing Note" /><ac:plain-text-link-body><![CDATA[missing-note]]></ac:plain-text-link-body></ac:link>');
  });

  it('strips heading anchors from wiki-links before resolving the page', () => {
    const { html } = markdownToStorage('See [[shipping-cadence#History]] and [[#local heading]].', { index: cadenceIndex });

    expect(html).toContain('<ri:page ri:content-title="Shipping Cadence" />');
    expect(html).toContain('<![CDATA[shipping-cadence#History]]>');
    expect(html).toContain('and #local heading.');
    expect(html).not.toContain('History" /');
  });

  it('titles wiki-link targets through the site\'s vault index', () => {
    const vault = mkdtempSync(join(tmpdir(), 'teaman-confluence-links-'));
    try {
      mkdirSync(join(vault, 'notes', 'sub'), { recursive: true });
      mkdirSync(join(vault, 'guides', 'using-it'), { recursive: true });
      writeFileSync(join(vault, 'notes', 'sub', 'deep.md'), '---\ntitle: Deep Dive\n---\n');
      writeFileSync(join(vault, 'guides', 'using-it', 'SUMMARY.md'), '# Using\n\n- [Intro](intro.md)\n');
      writeFileSync(join(vault, 'guides', 'using-it', 'intro.md'), '# Getting Started\n');
      const linkTitle = buildLinkTitles(createVaultIndex(vault));

      expect(linkTitle('deep')).toBe('Deep Dive');
      // A guide chapter is titled by its SUMMARY.md entry, as on the site;
      // the guide itself is its folder page.
      expect(linkTitle('intro')).toBe('Intro');
      expect(linkTitle('using-it')).toBe('Using');
      expect(linkTitle('nowhere')).toBeNull();
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('uploads Obsidian image embeds as attachments, sized as on the site', () => {
    const index = indexOf({ attachments: target => `/vault/notes/${target}` });
    const { html, images } = markdownToStorage('![[diagram.png]] ![[wide.png|300]]', { filePath: '/vault/notes/page.md', index });

    expect(html).toContain('<ac:image ac:alt="diagram.png"><ri:attachment ri:filename="diagram.png" /></ac:image>');
    expect(html).toContain('<ac:image ac:alt="wide.png" ac:width="300"><ri:attachment ri:filename="wide.png" /></ac:image>');
    expect(html).not.toContain('!<ac:');
    expect(images).toEqual([
      { absolutePath: '/vault/notes/diagram.png', filename: 'diagram.png' },
      { absolutePath: '/vault/notes/wide.png', filename: 'wide.png' },
    ]);
  });

  it('refuses to sync an embed of a file the vault does not have', () => {
    expect(() => markdownToStorage('![[gone.png]]', { filePath: '/vault/notes/page.md', index: indexOf() }))
      .toThrow('/vault/notes/page.md: ![[gone.png]]: no image named “gone.png” in the vault');
  });

  it('finds an embedded image anywhere in the vault through the index', () => {
    const index = indexOf({ attachments: target => (target === 'diagram.png' ? '/vault/attachments/diagram.png' : null) });
    const { images } = markdownToStorage('![[diagram.png]]', { filePath: '/vault/notes/page.md', index });
    expect(images).toEqual([{ absolutePath: '/vault/attachments/diagram.png', filename: 'diagram.png' }]);
  });

  it('leaves a labelled note where an HTML embed sits', () => {
    const index = indexOf({ attachments: target => `/vault/attachments/${target}` });
    const { html, images } = markdownToStorage('![[solar-system.html|The planets]]', { filePath: '/vault/notes/page.md', index });
    expect(html).toContain('<p><em>Interactive embed: The planets — open the online version to use it.</em></p>');
    expect(images).toEqual([]);
  });

  it('refuses to sync a note embed', () => {
    expect(() => markdownToStorage('![[Some Note]]', { filePath: '/vault/notes/page.md' }))
      .toThrow('/vault/notes/page.md: ![[Some Note]] embeds a note');
  });

  it('converts Obsidian callouts into Confluence admonition macros', () => {
    const { html } = markdownToStorage('> [!warning] Don\'t dress up an open question\n> Body text here.');

    expect(html).toContain('<ac:structured-macro ac:name="warning">');
    expect(html).toContain('<ac:parameter ac:name="title">Don\'t dress up an open question</ac:parameter>');
    expect(html).toContain('<ac:rich-text-body>');
    expect(html).toContain('<p>Body text here.</p>');
    expect(html).not.toContain('[!warning]');
  });

  it('keeps the full callout title when it contains inline markup', () => {
    const { html } = markdownToStorage('> [!tip] This is *really* important\n> Body text.');

    expect(html).toContain('<ac:parameter ac:name="title">This is really important</ac:parameter>');
    expect(html).toContain('<p>Body text.</p>');
    expect(html).not.toContain('<em>really</em>');
  });

  it('falls back to a plain blockquote for non-callout blockquotes', () => {
    const { html } = markdownToStorage('> Just a quote, not a callout.');

    expect(html).toContain('<blockquote>');
    expect(html).not.toContain('ac:structured-macro');
  });

  it('converts GFM task lists into Confluence task lists', () => {
    const { html } = markdownToStorage('- [ ] todo item\n- [x] done item');

    expect(html).toContain('<ac:task-list>');
    expect(html).toContain('<ac:task-status>incomplete</ac:task-status>');
    expect(html).toContain('<ac:task-status>complete</ac:task-status>');
    expect(html).toContain('<ac:task-body>todo item</ac:task-body>');
    expect(html).not.toContain('[ ]');
  });

  it('keeps a task list with an empty checkbox item as a task list', () => {
    const { html } = markdownToStorage('- [ ] real item\n- [ ]');

    expect(html).toContain('<ac:task-list>');
    expect(html).toContain('<ac:task-body>real item</ac:task-body>');
    expect(html).toContain('<ac:task-body></ac:task-body>');
    expect(html).not.toContain('[ ]');
  });

  it('leaves a mixed list (not every item is a checkbox) as a plain list', () => {
    const { html } = markdownToStorage('- [ ] todo item\n- a normal item');

    expect(html).not.toContain('ac:task-list');
    expect(html).toContain('<ul>');
  });

  it('renders remote images as a Confluence url-backed image without uploading', () => {
    const { html, images } = markdownToStorage('![a diagram](https://example.com/diagram.png)');

    expect(html).toBe('<p><ac:image ac:alt="a diagram"><ri:url ri:value="https://example.com/diagram.png" /></ac:image></p>');
    expect(images).toEqual([]);
  });

  it('resolves local images relative to the source file and queues them for upload', () => {
    const { html, images } = markdownToStorage('![a diagram](../assets/diagram.png)', { filePath: '/vault/notes/sub/page.md' });

    expect(html).toBe('<p><ac:image ac:alt="a diagram"><ri:attachment ri:filename="diagram.png" /></ac:image></p>');
    expect(images).toEqual([{ absolutePath: '/vault/notes/assets/diagram.png', filename: 'diagram.png' }]);
  });

  it('treats data: URIs and protocol-relative URLs as url images, not attachments', () => {
    const { html, images } = markdownToStorage(
      '![x](data:image/png;base64,iVBORw0K) ![y](//cdn.example.com/img.png)',
      { filePath: '/vault/notes/page.md' },
    );

    expect(html).toContain('<ri:url ri:value="data:image/png;base64,iVBORw0K" />');
    expect(html).toContain('<ri:url ri:value="//cdn.example.com/img.png" />');
    expect(images).toEqual([]);
  });

  it('disambiguates same-named images from different directories by path segment', () => {
    const { html, images } = markdownToStorage(
      '![a](a/diagram.png) ![b](b/diagram.png) ![a again](a/diagram.png)',
      { filePath: '/vault/notes/page.md' },
    );

    expect(images).toEqual([
      { absolutePath: '/vault/notes/a/diagram.png', filename: 'diagram.png' },
      { absolutePath: '/vault/notes/b/diagram.png', filename: 'b-diagram.png' },
    ]);
    expect(html).toContain('<ac:image ac:alt="a"><ri:attachment ri:filename="diagram.png" />');
    expect(html).toContain('<ac:image ac:alt="b"><ri:attachment ri:filename="b-diagram.png" />');
    expect(html).toContain('<ac:image ac:alt="a again"><ri:attachment ri:filename="diagram.png" />');
  });
});

// Svg resolution mirrors the site build (remark-inline-svg): note-relative,
// then the vault root, then <vault>/public. That needs real files on disk —
// the resolver probes with existsSync.
describe('sync-confluence svg images', () => {
  let vault;
  let notePath;

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-sync-svg-'));
    mkdirSync(join(vault, 'notes'), { recursive: true });
    notePath = join(vault, 'notes', 'page.md');
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it('resolves an svg at the vault root when it is not next to the note', () => {
    mkdirSync(join(vault, 'attachments'));
    writeFileSync(join(vault, 'attachments', 'flow.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const { html, images } = markdownToStorage('![flow](attachments/flow.svg)', { filePath: notePath, vaultDir: vault });

    expect(html).toContain('<ri:attachment ri:filename="flow.svg" />');
    expect(images).toEqual([{ absolutePath: join(vault, 'attachments', 'flow.svg'), filename: 'flow.svg' }]);
  });

  it('prefers the note-relative svg over a same-named one at the vault root', () => {
    mkdirSync(join(vault, 'notes', 'assets'), { recursive: true });
    mkdirSync(join(vault, 'assets'));
    writeFileSync(join(vault, 'notes', 'assets', 'cup.svg'), '<svg></svg>');
    writeFileSync(join(vault, 'assets', 'cup.svg'), '<svg></svg>');

    const { images } = markdownToStorage('![cup](assets/cup.svg)', { filePath: notePath, vaultDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'assets', 'cup.svg'), filename: 'cup.svg' }]);
  });

  it('resolves site-root-style /path.svg references against the vault, then vault public/', () => {
    mkdirSync(join(vault, 'public', 'images'), { recursive: true });
    writeFileSync(join(vault, 'public', 'images', 'logo.svg'), '<svg></svg>');

    const { images } = markdownToStorage('![logo](/images/logo.svg)', { filePath: notePath, vaultDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'public', 'images', 'logo.svg'), filename: 'logo.svg' }]);
  });

  it('keeps the note-relative guess for a missing svg so the upload step can warn', () => {
    const { images } = markdownToStorage('![gone](missing.svg)', { filePath: notePath, vaultDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'missing.svg'), filename: 'missing.svg' }]);
  });

  it('inlines the svg markup into the configured macro instead of uploading', () => {
    writeFileSync(join(vault, 'notes', 'cup.svg'), '<?xml version="1.0"?>\n<!-- a cup -->\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>\n');

    const { html, images } = markdownToStorage('![cup](cup.svg)', { filePath: notePath, vaultDir: vault, macros: { svg: 'html' } });

    expect(html).toContain('<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>]]></ac:plain-text-body></ac:structured-macro>');
    expect(html).not.toContain('<?xml');
    expect(html).not.toContain('ri:attachment');
    expect(images).toEqual([]);
  });

  it('inlines Obsidian svg embeds through the same macro path', () => {
    writeFileSync(join(vault, 'notes', 'cup.svg'), '<svg><circle r="1" /></svg>');

    const { html, images } = markdownToStorage('![[cup.svg]]', { filePath: notePath, vaultDir: vault, macros: { svg: 'html' }, index: createVaultIndex(vault) });

    expect(html).toContain('<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<svg><circle r="1" /></svg>]]></ac:plain-text-body></ac:structured-macro>');
    expect(images).toEqual([]);
  });

  it('falls back to the attachment path when the macro is set but the svg is missing or malformed', () => {
    writeFileSync(join(vault, 'notes', 'not-really.svg'), 'just text, no svg root');

    const { html, images } = markdownToStorage('![a](not-really.svg) ![b](gone.svg)', { filePath: notePath, vaultDir: vault, macros: { svg: 'html' } });

    expect(html).not.toContain('ac:structured-macro');
    expect(images).toEqual([
      { absolutePath: join(vault, 'notes', 'not-really.svg'), filename: 'not-really.svg' },
      { absolutePath: join(vault, 'notes', 'gone.svg'), filename: 'gone.svg' },
    ]);
  });

  it('resolves other images the way the site does too', () => {
    mkdirSync(join(vault, 'attachments'));
    writeFileSync(join(vault, 'attachments', 'photo.png'), 'png bytes');

    const { images } = markdownToStorage('![photo](attachments/photo.png)', { filePath: notePath, vaultDir: vault, macros: { svg: 'html' } });

    expect(images).toEqual([{ absolutePath: join(vault, 'attachments', 'photo.png'), filename: 'photo.png' }]);
  });

  it('keeps the note-relative guess for an image nothing matches, so the upload warns', () => {
    const { images } = markdownToStorage('![gone](gone.png)', { filePath: notePath, vaultDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'gone.png'), filename: 'gone.png' }]);
  });
});

// tikz/typst fences: pageStorage compiles them (markdown-it renders
// synchronously, so in a pre-pass) and they sync like local .svg images.
// Compilers are injected fakes — the real ones have their own smoke tests in
// remark-fence-svg.test.ts.
describe('sync-confluence tikz/typst fences', () => {
  let cacheDir;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'teaman-sync-fence-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const tikz = vi.fn(async () => '<svg><circle r="1"/></svg>');

  it('inlines a compiled diagram through the svg macro', async () => {
    const { html, images } = await pageStorage('```tikz\n\\draw (0,0);\n```', { cacheDir, compilers: { tikz }, macros: { svg: 'html' } });

    expect(html).toMatch(/^<ac:structured-macro ac:name="html"><ac:plain-text-body><!\[CDATA\[<svg class="[^"]*content-svg tikz-svg"/);
    expect(images).toEqual([]);
  });

  it('uploads the cached render as an attachment when no svg macro is set', async () => {
    const { html, images } = await pageStorage('```tikz\n\\draw (0,0);\n```', { cacheDir, compilers: { tikz } });

    expect(html).toMatch(/^<ac:image ac:alt="tikz diagram"><ri:attachment ri:filename="tikz-[0-9a-f]{16}\.svg" \/><\/ac:image>$/);
    expect(images).toHaveLength(1);
    expect(images[0].absolutePath.startsWith(cacheDir)).toBe(true);
  });

  it('syncs a labeled source block when no compile ran', () => {
    const { html, images } = markdownToStorage('```tikz\n\\draw (0,0);\n```');

    expect(html).toContain('<ac:parameter ac:name="title">TikZ diagram (source)</ac:parameter>');
    expect(html).toContain('<ac:parameter ac:name="language">none</ac:parameter>');
    expect(html).toContain('\\draw (0,0);');
    expect(images).toEqual([]);
  });

  it('compiles each unique fence once, and syncs the source of one that fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const once = vi.fn(async () => '<svg><path d="M0 0"/></svg>');
    const typst = vi.fn(async () => {
      throw new Error('expected expression, found <eof>\nmore log lines');
    });
    const markdown = '---\ntitle: T\n---\n\n```tikz\na\n```\n\nprose\n\n```tikz\na\n```\n\n```typst\nb\n```\n';

    const { html, images } = await pageStorage(markdown, { cacheDir, compilers: { tikz: once, typst } });

    expect(once).toHaveBeenCalledTimes(1);
    expect(images).toHaveLength(1);
    expect(html).toContain('<ac:parameter ac:name="title">Typst diagram (source)</ac:parameter>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('typst fence failed to compile, syncing its source instead: expected expression, found <eof>'));
  });
});

describe('sync-confluence page selection', () => {
  let vault;
  afterEach(() => rmSync(vault, { recursive: true, force: true }));

  it('syncs exactly the files of pages the site publishes', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-confluence-pages-'));
    const write = (path, content = '# x\n') => {
      mkdirSync(join(vault, path, '..'), { recursive: true });
      writeFileSync(join(vault, path), content);
    };
    write('notes/live.md');
    write('notes/draft.md', '---\ndraft: true\n---\n# Draft\n');
    write('notes/_templates/tpl.md');
    write('guides/intro/SUMMARY.md', '# Intro\n\n- [One](one.md)\n- [Two](two.md)\n');
    write('guides/intro/one.md');
    write('guides/intro/two.md', '---\ndraft: true\n---\n# Two\n');
    write('guides/intro/unlisted.md');
    const catalog = openVaultCatalog(vault);
    const index = createVaultIndex(vault, { catalog });
    const rel = pages => pages.map(page => page.sourcePath.slice(vault.length + 1));

    expect(rel(folderPagePlan(catalog, index, 'notes'))).toEqual(['notes/live.md']);
    expect(rel(folderPagePlan(catalog, index, 'guides'))).toEqual(['guides/intro/one.md']);
  });

  it('titles pages and book folder pages as the site titles them', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-confluence-titles-'));
    const write = (path, content) => {
      mkdirSync(join(vault, path, '..'), { recursive: true });
      writeFileSync(join(vault, path), content);
    };
    write('notes/foo/index.md', 'No title here.\n');
    write('notes/team-notes/plan.md', '# The Plan\n');
    write('guides/setup/SUMMARY.md', '---\ntitle: Setting Up\n---\n\n- [First steps](one.md)\n');
    write('guides/setup/one.md', '# One\n');
    write('references/lang/SUMMARY.md', '# The Language\n\n- [Syntax](syntax.md)\n');
    write('references/lang/syntax.md', '# Syntax rules\n');
    const catalog = openVaultCatalog(vault);
    const index = createVaultIndex(vault, { catalog });
    const plan = folder => folderPagePlan(catalog, index, folder).map(({ title, folders }) => ({ title, folders }));

    // `foo` and its folder `Foo` are one title to Confluence, which ignores case.
    expect(plan('notes')).toEqual([
      { title: 'foo (notes/foo/index)', folders: ['Foo (notes/foo)'] },
      { title: 'The Plan', folders: ['Team Notes'] },
    ]);
    expect(plan('guides')).toEqual([{ title: 'First steps', folders: ['Setting Up'] }]);
    expect(plan('references')).toEqual([{ title: 'Syntax', folders: ['The Language'] }]);
  });

  it('refuses to sync two pages under one title it cannot tell apart', () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-confluence-clash-'));
    for (const [path, content] of Object.entries({
      'notes/a.md': '# Plan\n',
      'notes/b.md': '# Plan\n',
      'notes/c.md': '# Plan (notes/a)\n',
    })) {
      mkdirSync(join(vault, path, '..'), { recursive: true });
      writeFileSync(join(vault, path), content);
    }
    const catalog = openVaultCatalog(vault);
    expect(() => folderPagePlan(catalog, createVaultIndex(vault, { catalog }), 'notes'))
      .toThrow('Two pages would sync as "Plan (notes/a)"');
  });
});

describe('sync-confluence argument parsing', () => {
  it('uses node parseArgs support for equals syntax and repeated roots', () => {
    const args = parseArgs([
      '--base-url=https://wiki.local/',
      '--pat=secret',
      '--roots', 'guides=111',
      '--roots', '{"notes":"222"}',
      '--only=guides, notes',
      '--timeout-ms=5000',
      '--svg-macro=html',
      '--apply',
    ]);

    expect(args.baseUrl).toBe('https://wiki.local');
    expect(args.pat).toBe('secret');
    expect(args.roots).toEqual({ guides: '111', notes: '222' });
    expect([...args.only]).toEqual(['guides', 'notes']);
    expect(args.timeoutMs).toBe(5000);
    expect(args.svgMacro).toBe('html');
    expect(args.apply).toBe(true);
  });

  it('reads the svg macro from CONFLUENCE_SVG_MACRO when the flag is absent', () => {
    process.env.CONFLUENCE_SVG_MACRO = 'svg-embed';

    expect(parseArgs([]).svgMacro).toBe('svg-embed');
  });
});
