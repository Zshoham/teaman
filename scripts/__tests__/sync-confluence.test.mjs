import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileFenceSvgs, markdownToStorage, pageTitle, parseArgs, storageBody } from '../sync-confluence.mjs';

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

describe('sync-confluence markdown rendering', () => {
  it('uses frontmatter titles and removes a duplicate leading H1 from storage body', () => {
    const markdown = '---\ntitle: Vault Static Site Architecture\ntags: [architecture]\n---\n\n# Vault Static Site Architecture\n\nIntro paragraph.';

    expect(pageTitle(markdown, '/content/notes/vault-architecture.md')).toBe('Vault Static Site Architecture');
    expect(storageBody(markdown, 'Vault Static Site Architecture').html).toBe('<p>Intro paragraph.</p>');
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
    const { html } = markdownToStorage('```mermaid\ngraph TD; A-->B;\n```', { mermaidMacro: 'mermaid-cloud' });

    expect(html).toBe('<ac:structured-macro ac:name="mermaid-cloud"><ac:plain-text-body><![CDATA[graph TD; A-->B;]]></ac:plain-text-body></ac:structured-macro>');
  });

  it('resolves wiki-links to Confluence page links by title, and guesses a title otherwise', () => {
    const notesMap = new Map([['shipping-cadence', 'Shipping Cadence']]);
    const { html } = markdownToStorage('See [[shipping-cadence|the cadence guide]] and [[missing-note]].', { notesMap });

    expect(html).toContain('<ac:link><ri:page ri:content-title="Shipping Cadence" /><ac:plain-text-link-body><![CDATA[the cadence guide]]></ac:plain-text-link-body></ac:link>');
    expect(html).toContain('<ac:link><ri:page ri:content-title="Missing Note" /><ac:plain-text-link-body><![CDATA[missing-note]]></ac:plain-text-link-body></ac:link>');
  });

  it('strips heading anchors from wiki-links before resolving the page', () => {
    const notesMap = new Map([['shipping-cadence', 'Shipping Cadence']]);
    const { html } = markdownToStorage('See [[shipping-cadence#History]] and [[#local heading]].', { notesMap });

    expect(html).toContain('<ri:page ri:content-title="Shipping Cadence" />');
    expect(html).toContain('<![CDATA[shipping-cadence#History]]>');
    expect(html).toContain('and #local heading.');
    expect(html).not.toContain('History" /');
  });

  it('uploads Obsidian image embeds as attachments instead of linking a bogus page', () => {
    const { html, images } = markdownToStorage('![[diagram.png]] and ![[Some Note]]', { filePath: '/vault/notes/page.md' });

    expect(html).toContain('<ac:image ac:alt="diagram.png"><ri:attachment ri:filename="diagram.png" /></ac:image>');
    expect(html).toContain('<ri:page ri:content-title="Some Note" />');
    expect(html).not.toContain('!<ac:');
    expect(images).toEqual([{ absolutePath: '/vault/notes/diagram.png', filename: 'diagram.png' }]);
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

    const { html, images } = markdownToStorage('![flow](attachments/flow.svg)', { filePath: notePath, contentDir: vault });

    expect(html).toContain('<ri:attachment ri:filename="flow.svg" />');
    expect(images).toEqual([{ absolutePath: join(vault, 'attachments', 'flow.svg'), filename: 'flow.svg' }]);
  });

  it('prefers the note-relative svg over a same-named one at the vault root', () => {
    mkdirSync(join(vault, 'notes', 'assets'), { recursive: true });
    mkdirSync(join(vault, 'assets'));
    writeFileSync(join(vault, 'notes', 'assets', 'cup.svg'), '<svg></svg>');
    writeFileSync(join(vault, 'assets', 'cup.svg'), '<svg></svg>');

    const { images } = markdownToStorage('![cup](assets/cup.svg)', { filePath: notePath, contentDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'assets', 'cup.svg'), filename: 'cup.svg' }]);
  });

  it('resolves site-root-style /path.svg references against the vault, then vault public/', () => {
    mkdirSync(join(vault, 'public', 'images'), { recursive: true });
    writeFileSync(join(vault, 'public', 'images', 'logo.svg'), '<svg></svg>');

    const { images } = markdownToStorage('![logo](/images/logo.svg)', { filePath: notePath, contentDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'public', 'images', 'logo.svg'), filename: 'logo.svg' }]);
  });

  it('keeps the note-relative guess for a missing svg so the upload step can warn', () => {
    const { images } = markdownToStorage('![gone](missing.svg)', { filePath: notePath, contentDir: vault });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'missing.svg'), filename: 'missing.svg' }]);
  });

  it('inlines the svg markup into the configured macro instead of uploading', () => {
    writeFileSync(join(vault, 'notes', 'cup.svg'), '<?xml version="1.0"?>\n<!-- a cup -->\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>\n');

    const { html, images } = markdownToStorage('![cup](cup.svg)', { filePath: notePath, contentDir: vault, svgMacro: 'html' });

    expect(html).toContain('<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>]]></ac:plain-text-body></ac:structured-macro>');
    expect(html).not.toContain('<?xml');
    expect(html).not.toContain('ri:attachment');
    expect(images).toEqual([]);
  });

  it('inlines Obsidian svg embeds through the same macro path', () => {
    writeFileSync(join(vault, 'notes', 'cup.svg'), '<svg><circle r="1" /></svg>');

    const { html, images } = markdownToStorage('![[cup.svg]]', { filePath: notePath, contentDir: vault, svgMacro: 'html' });

    expect(html).toContain('<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<svg><circle r="1" /></svg>]]></ac:plain-text-body></ac:structured-macro>');
    expect(images).toEqual([]);
  });

  it('falls back to the attachment path when the macro is set but the svg is missing or malformed', () => {
    writeFileSync(join(vault, 'notes', 'not-really.svg'), 'just text, no svg root');

    const { html, images } = markdownToStorage('![a](not-really.svg) ![b](gone.svg)', { filePath: notePath, contentDir: vault, svgMacro: 'html' });

    expect(html).not.toContain('ac:structured-macro');
    expect(images).toEqual([
      { absolutePath: join(vault, 'notes', 'not-really.svg'), filename: 'not-really.svg' },
      { absolutePath: join(vault, 'notes', 'gone.svg'), filename: 'gone.svg' },
    ]);
  });

  it('leaves non-svg images on the plain note-relative rule', () => {
    mkdirSync(join(vault, 'attachments'));
    writeFileSync(join(vault, 'attachments', 'photo.png'), 'png bytes');

    const { images } = markdownToStorage('![photo](attachments/photo.png)', { filePath: notePath, contentDir: vault, svgMacro: 'html' });

    expect(images).toEqual([{ absolutePath: join(vault, 'notes', 'attachments', 'photo.png'), filename: 'photo.png' }]);
  });
});

// tikz/typst fences: compileFenceSvgs pre-compiles (markdown-it renders
// synchronously), renderCodeToken looks the results up and emits them like
// local .svg images. Compilers are injected fakes — the real ones have their
// own smoke tests in remark-fence-svg.test.ts.
describe('sync-confluence tikz/typst fences', () => {
  let cacheDir;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'teaman-sync-fence-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('inlines a compiled diagram through the svg macro', () => {
    const fenceSvgs = new Map([['tikz\0\\draw (0,0);', { svg: '<svg class="content-svg tikz-svg"/>', path: '/cache/tikz-abc.svg' }]]);

    const { html, images } = markdownToStorage('```tikz\n\\draw (0,0);\n```', { fenceSvgs, svgMacro: 'html' });

    expect(html).toBe('<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<svg class="content-svg tikz-svg"/>]]></ac:plain-text-body></ac:structured-macro>');
    expect(images).toEqual([]);
  });

  it('uploads the cached render as an attachment when no svg macro is set', () => {
    const fenceSvgs = new Map([['typst\0$ x^2 $', { svg: '<svg/>', path: '/cache/typst-abc.svg' }]]);

    const { html, images } = markdownToStorage('```typst\n$ x^2 $\n```', { fenceSvgs });

    expect(html).toBe('<ac:image ac:alt="typst diagram"><ri:attachment ri:filename="typst-abc.svg" /></ac:image>');
    expect(images).toEqual([{ absolutePath: '/cache/typst-abc.svg', filename: 'typst-abc.svg' }]);
  });

  it('falls back to a labeled source block when there is no compiled entry', () => {
    const { html, images } = markdownToStorage('```tikz\n\\draw (0,0);\n```', { fenceSvgs: new Map() });

    expect(html).toContain('<ac:parameter ac:name="title">TikZ diagram (source)</ac:parameter>');
    expect(html).toContain('<ac:parameter ac:name="language">none</ac:parameter>');
    expect(html).toContain('\\draw (0,0);');
    expect(images).toEqual([]);
  });

  it('compiles each unique fence once and maps failures to null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tikz = vi.fn(async () => '<svg><path d="M0 0"/></svg>');
    const typst = vi.fn(async () => {
      throw new Error('expected expression, found <eof>\nmore log lines');
    });
    const markdown = '---\ntitle: T\n---\n\n```tikz\na\n```\n\nprose\n\n```tikz\na\n```\n\n```typst\nb\n```\n';

    const fenceSvgs = await compileFenceSvgs(markdown, { cacheDir, compilers: { tikz, typst } });

    expect(tikz).toHaveBeenCalledTimes(1);
    expect(fenceSvgs.get('tikz\0a').svg).toContain('content-svg tikz-svg');
    expect(fenceSvgs.get('typst\0b')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('typst fence failed to compile'));
  });

  it('round-trips compileFenceSvgs output into the rendered body', async () => {
    const tikz = vi.fn(async () => '<svg><circle r="1"/></svg>');
    const markdown = '```tikz\n\\draw (0,0);\n```';

    const fenceSvgs = await compileFenceSvgs(markdown, { cacheDir, compilers: { tikz } });
    const { html, images } = markdownToStorage(markdown, { fenceSvgs });

    expect(html).toContain('<ac:image ac:alt="tikz diagram"><ri:attachment ri:filename="');
    expect(images).toHaveLength(1);
    expect(images[0].absolutePath.startsWith(cacheDir)).toBe(true);
    expect(images[0].filename).toMatch(/^tikz-[0-9a-f]{16}\.svg$/);
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
