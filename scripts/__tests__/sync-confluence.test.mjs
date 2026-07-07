import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markdownToStorage, pageTitle, parseArgs, storageBody } from '../sync-confluence.mjs';

const confluenceEnv = [
  'CONFLUENCE_BASE_URL',
  'CONFLUENCE_USER',
  'CONFLUENCE_TOKEN',
  'CONFLUENCE_PAT',
  'CONFLUENCE_ROOTS',
  'CONFLUENCE_SPACE',
  'CONFLUENCE_TIMEOUT_MS',
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

describe('sync-confluence argument parsing', () => {
  it('uses node parseArgs support for equals syntax and repeated roots', () => {
    const args = parseArgs([
      '--base-url=https://wiki.local/',
      '--pat=secret',
      '--roots', 'guides=111',
      '--roots', '{"notes":"222"}',
      '--only=guides, notes',
      '--timeout-ms=5000',
      '--apply',
    ]);

    expect(args.baseUrl).toBe('https://wiki.local');
    expect(args.pat).toBe('secret');
    expect(args.roots).toEqual({ guides: '111', notes: '222' });
    expect([...args.only]).toEqual(['guides', 'notes']);
    expect(args.timeoutMs).toBe(5000);
    expect(args.apply).toBe(true);
  });
});
