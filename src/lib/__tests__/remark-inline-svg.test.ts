import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { remarkInlineSvg, decorateSvg } from '../remark-inline-svg.mjs';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10z"/></svg>';

// Minimal mdast-compatible node factories (see remark-mermaid.test.ts).
const img = (url: string, alt = '') => ({ type: 'image', url, alt });
const text = (value: string) => ({ type: 'text', value });
const p = (...children: object[]) => ({ type: 'paragraph', children });

// A throwaway vault: notes/note.md next to notes/assets/local.svg, an
// attachments/ dir at the root, and a public/ root for absolute URLs.
let vault: string;
beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'teaman-svg-'));
  for (const dir of ['notes/assets', 'attachments', 'public/images']) {
    mkdirSync(join(vault, dir), { recursive: true });
  }
  writeFileSync(join(vault, 'notes/assets/local.svg'), SVG);
  writeFileSync(join(vault, 'attachments/shared.svg'), SVG);
  writeFileSync(join(vault, 'public/images/logo.svg'), SVG);
  writeFileSync(
    join(vault, 'attachments/decorated.svg'),
    '<?xml version="1.0"?>\n<!DOCTYPE svg>\n<!-- hi -->\n<svg class="art" viewBox="0 0 1 1"></svg>',
  );
  writeFileSync(
    join(vault, 'attachments/titled.svg'),
    '<svg viewBox="0 0 1 1"><title>Author title</title></svg>',
  );
  writeFileSync(join(vault, 'attachments/not-an-svg.svg'), '<html>nope</html>');
});
afterAll(() => rmSync(vault, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

function run(children: object[], { notePath }: { notePath?: string } = {}) {
  const tree = { type: 'root', children: [...children] };
  const file = notePath ? { path: notePath } : undefined;
  remarkInlineSvg({ roots: [vault, join(vault, 'public')] })(tree as any, file);
  return tree.children as any[];
}

describe('remarkInlineSvg', () => {
  it('renders a standalone svg image as a figure with the alt as caption', () => {
    const [node] = run([p(img('attachments/shared.svg', 'Shared diagram'))]);
    expect(node.type).toBe('html');
    expect(node.value).toMatch(/^<figure class="content-figure"><svg/);
    expect(node.value).toContain('<figcaption>Shared diagram</figcaption>');
    expect(node.value).toContain('<path fill="currentColor"');
    expect(node.value).toContain('class="content-svg"');
    expect(node.value).toContain('role="img"');
    expect(node.value).toContain('aria-label="Shared diagram"');
  });

  it('injects the alt as an svg <title> so it shows as a hover tooltip', () => {
    const [node] = run([p(img('attachments/shared.svg', 'Shared diagram'))]);
    expect(node.value).toMatch(/<svg[^>]*><title>Shared diagram<\/title>/);
  });

  it('keeps an author-written <title> instead of stacking a second one', () => {
    const [node] = run([p(img('attachments/titled.svg', 'alt text'))]);
    expect(node.value).toContain('<title>Author title</title>');
    expect(node.value).not.toContain('<title>alt text</title>');
  });

  it('keeps an image flowing inside text inline — tooltip, no figure', () => {
    const [para] = run([p(text('see '), img('attachments/shared.svg', 'Shared diagram'))]);
    expect(para.type).toBe('paragraph');
    const node = para.children[1];
    expect(node.type).toBe('html');
    expect(node.value.startsWith('<svg')).toBe(true);
    expect(node.value).not.toContain('<figure');
    expect(node.value).toContain('<title>Shared diagram</title>');
  });

  it('resolves a relative url against the note directory first', () => {
    const [node] = run([p(img('assets/local.svg', 'Local'))], {
      notePath: join(vault, 'notes/note.md'),
    });
    expect(node.type).toBe('html');
  });

  it('resolves an absolute /path against the roots', () => {
    const [node] = run([p(img('/images/logo.svg', 'Logo'))]);
    expect(node.type).toBe('html');
  });

  it('strips the xml prolog, doctype, and comments; merges into an existing class', () => {
    const [node] = run([p(img('attachments/decorated.svg', 'Art'))]);
    expect(node.value).not.toContain('<?xml');
    expect(node.value).not.toContain('DOCTYPE');
    expect(node.value).toContain('class="art content-svg"');
  });

  it('marks an svg with empty alt as decorative, with no figure or caption', () => {
    const [node] = run([p(img('attachments/shared.svg'))]);
    expect(node.type).toBe('html');
    expect(node.value.startsWith('<svg')).toBe(true);
    expect(node.value).toContain('aria-hidden="true"');
    expect(node.value).not.toContain('role="img"');
    expect(node.value).not.toContain('<figure');
    expect(node.value).not.toContain('<title>');
  });

  it('escapes html-special characters in the alt text', () => {
    const [node] = run([p(img('attachments/shared.svg', 'a "b" <c> & d'))]);
    expect(node.value).toContain('aria-label="a &quot;b&quot; &lt;c&gt; &amp; d"');
    expect(node.value).toContain('<figcaption>a &quot;b&quot; &lt;c&gt; &amp; d</figcaption>');
  });

  it('decodes %20 and ignores query/hash when resolving', () => {
    writeFileSync(join(vault, 'attachments/two words.svg'), SVG);
    const [node] = run([p(img('attachments/two%20words.svg?v=1#frag', 'x'))]);
    expect(node.type).toBe('html');
  });

  it('leaves remote and protocol-relative urls untouched', () => {
    const remote = img('https://example.com/x.svg', 'x');
    const protoRel = img('//example.com/x.svg', 'x');
    const [para] = run([p(remote, protoRel)]);
    expect(para.type).toBe('paragraph');
    expect(para.children[0]).toBe(remote);
    expect(para.children[1]).toBe(protoRel);
  });

  it('leaves non-svg images untouched', () => {
    const png = img('attachments/photo.png', 'x');
    const [para] = run([p(png)]);
    expect(para.type).toBe('paragraph');
    expect(para.children[0]).toBe(png);
  });

  it('warns and leaves the image when the file is missing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = img('attachments/nope.svg', 'x');
    const [para] = run([p(missing)]);
    expect(para.children[0]).toBe(missing);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('nope.svg'));
  });

  it('warns and leaves the image when the file has no <svg> root', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = img('attachments/not-an-svg.svg', 'x');
    const [para] = run([p(bad)]);
    expect(para.children[0]).toBe(bad);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('not-an-svg.svg'));
  });

  it('transforms images nested inside other containers', () => {
    const [quote] = run([
      { type: 'blockquote', children: [p(img('attachments/shared.svg', 'x'))] },
    ]);
    expect(quote.children[0].type).toBe('html');
    expect(quote.children[0].value).toContain('<figcaption>x</figcaption>');
  });
});

describe('decorateSvg', () => {
  it('does not duplicate existing role/aria-label attributes', () => {
    const out = decorateSvg('<svg role="presentation" aria-label="kept"></svg>', 'alt')!;
    expect(out).toContain('role="presentation"');
    expect(out).toContain('aria-label="kept"');
    expect(out).not.toContain('role="img"');
    expect(out).not.toContain('aria-label="alt"');
  });

  it('returns null when there is no svg root tag', () => {
    expect(decorateSvg('<div>hello</div>', 'x')).toBeNull();
  });
});
