import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entryTitle, humanizeId, withoutTitleHeading } from '../entry-title.mjs';
import { createSiteMarkdownRenderer } from '../site-markdown.mjs';

// Each body: the title it gives an entry with no frontmatter title, and what is
// left once the title heading is dropped.
const CASES = [
  { name: 'a leading H1', body: '# Real Title\n\nIntro.', title: 'Real Title', rest: 'Intro.' },
  { name: 'a setext H1', body: 'Real Title\n==========\n\nIntro.', title: 'Real Title', rest: 'Intro.' },
  { name: 'blank lines first', body: '\n\n# Real Title\nIntro.', title: 'Real Title', rest: 'Intro.' },
  { name: 'an H1 with an anchor', body: '# Real Title {#custom}\n\nIntro.', title: 'Real Title', rest: 'Intro.' },
  { name: 'only an H1', body: '# Real Title', title: 'Real Title', rest: '' },
  {
    name: 'a link definition before the H1',
    body: '[target]: https://example.com\n# Real Title\n\nSee [target].',
    title: 'Real Title',
    rest: '[target]: https://example.com\n\nSee [target].',
  },
  { name: 'an H1 after a paragraph', body: 'Intro.\n\n# Later', title: 'my note', rest: 'Intro.\n\n# Later' },
  { name: 'a leading H2', body: '## Section\n\nIntro.', title: 'my note', rest: '## Section\n\nIntro.' },
  { name: 'an H1 inside a fence', body: '```md\n# Not a title\n```', title: 'my note', rest: '```md\n# Not a title\n```' },
  { name: 'an empty body', body: '', title: 'my note', rest: '' },
];

describe.each(CASES)('$name', ({ body, title, rest }) => {
  it('titles the entry and drops the title heading', () => {
    expect(entryTitle({ data: {}, body, id: 'notes/my_note' })).toBe(title);
    expect(withoutTitleHeading(body)).toBe(rest);
  });
});

describe('entryTitle', () => {
  it('prefers a frontmatter title, and still drops the heading', () => {
    const body = '# Heading Title\n\nIntro.';
    expect(entryTitle({ data: { title: '  Frontmatter Title ' }, body, id: 'x' })).toBe('Frontmatter Title');
    expect(withoutTitleHeading(body)).toBe('Intro.');
  });

  it('ignores an empty or non-string frontmatter title', () => {
    expect(entryTitle({ data: { title: '' }, body: '# H', id: 'x' })).toBe('H');
    expect(entryTitle({ data: { title: null }, body: '', id: 'some-thing' })).toBe('some thing');
  });

  it('humanizes the last segment of an id', () => {
    expect(humanizeId('guides/getting_started-now')).toBe('getting started now');
  });
});

// The site drops the title heading in mdast (remark-strip-h1.mjs); it must be
// the same heading.
describe('the site pipeline', () => {
  let scratch;
  let renderer;
  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'teaman-title-'));
    mkdirSync(join(scratch, 'vault'));
    renderer = await createSiteMarkdownRenderer({
      vaultDir: join(scratch, 'vault'),
      base: '/',
      engineDir: fileURLToPath(new URL('../../..', import.meta.url)),
      diagramCacheDir: join(scratch, 'diagrams'),
    });
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const render = async markdown => (await renderer.render(markdown, {
    fileURL: pathToFileURL(join(scratch, 'vault', 'notes', 'page.md')),
  })).code;

  it.each(CASES)('drops the same heading for $name', async ({ body, rest }) => {
    expect(await render(body)).toBe(await render(rest));
  });
});
