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
    expect(storageBody(markdown, 'Vault Static Site Architecture')).toBe('<p>Intro paragraph.</p>');
  });

  it('renders markdown tables with the markdown parser instead of treating them as paragraphs', () => {
    const html = markdownToStorage('| Convention | Meaning |\n|---|---|\n| `_*.md` | Draft deck |');

    expect(html).toContain('<table>');
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<th>Convention</th>');
    expect(html).toContain('<code>_*.md</code>');
  });

  it('keeps wrapped list continuation text inside the list item', () => {
    const html = markdownToStorage('* There were drinks\n* We sat together for a while to think about how to progress the agenda of their\n  most efficient thoughts');

    expect(html).toContain('<ul>');
    expect(html).toContain('We sat together for a while to think about how to progress the agenda of their\nmost efficient thoughts');
    expect(html).not.toContain('</li>\n<p>most efficient thoughts</p>');
  });

  it('keeps Confluence code macros for fenced code blocks', () => {
    const html = markdownToStorage('```\nalpha\n]]>\nomega\n```');

    expect(html).toBe('<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[alpha\n]]]]><![CDATA[>\nomega]]></ac:plain-text-body></ac:structured-macro>');
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
