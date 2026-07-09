import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { remarkFenceSvg, themeAdaptSvg, classifySvg } from '../remark-fence-svg.mjs';

// Minimal mdast-compatible node factories (see remark-mermaid.test.ts).
const code = (lang: string | null, value: string) => ({ type: 'code', lang, value });

let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'teaman-fence-'));
});
afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function run(children: object[], compilers: object) {
  const tree = { type: 'root', children: [...children] };
  await remarkFenceSvg({ cacheDir, compilers })(tree as any);
  return tree.children as any[];
}

describe('remarkFenceSvg', () => {
  const FAKE_SVG = '<svg viewBox="0 0 1 1" stroke="#000" fill="black"><path d="M0 0"/></svg>';

  it('replaces a tikz fence with theme-adapted, classified inline svg', async () => {
    const tikz = vi.fn(async () => FAKE_SVG);
    const [node] = await run([code('tikz', '\\draw (0,0);')], { tikz });
    expect(node.type).toBe('html');
    expect(node.value).toContain('class="content-svg tikz-svg"');
    expect(node.value).toContain('stroke="currentColor"');
    expect(node.value).toContain('fill="currentColor"');
    expect(tikz).toHaveBeenCalledWith('\\draw (0,0);');
  });

  it('caches by source hash: identical fences compile once, edits recompile', async () => {
    const tikz = vi.fn(async () => FAKE_SVG);
    await run([code('tikz', 'same')], { tikz });
    const [fromCache] = await run([code('tikz', 'same')], { tikz });
    expect(tikz).toHaveBeenCalledTimes(1);
    expect(fromCache.value).toContain('content-svg tikz-svg');

    await run([code('tikz', 'edited')], { tikz });
    expect(tikz).toHaveBeenCalledTimes(2);
  });

  it('renders a visible notice and warns when the compiler fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const typst = vi.fn(async () => {
      throw new Error('expected expression, found <eof>\nmore log lines');
    });
    const [node] = await run([code('typst', '$ broken')], { typst });
    expect(node.type).toBe('html');
    expect(node.value).toContain('class="diagram-error"');
    expect(node.value).toContain('typst diagram could not be rendered.');
    expect(node.value).toContain('expected expression, found &lt;eof&gt;');
    expect(node.value).not.toContain('more log lines');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('typst fence failed'));
  });

  it('treats a compiler result without an <svg> root as a failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tikz = vi.fn(async () => 'This is TeX, Version 3.14');
    const [node] = await run([code('tikz', 'x')], { tikz });
    expect(node.value).toContain('diagram-error');
    expect(warn).toHaveBeenCalled();
  });

  it('leaves other fences and prose untouched', async () => {
    const js = code('js', 'const x = 1;');
    const mermaid = code('mermaid', 'graph TD');
    const [a, b] = await run([js, mermaid], { tikz: vi.fn() });
    expect(a).toBe(js);
    expect(b).toBe(mermaid);
  });

  it('transforms fences nested inside containers', async () => {
    const tikz = vi.fn(async () => FAKE_SVG);
    const [quote] = await run(
      [{ type: 'blockquote', children: [code('tikz', 'nested')] }],
      { tikz },
    );
    expect(quote.children[0].type).toBe('html');
  });
});

describe('themeAdaptSvg', () => {
  it('rewrites black ink attributes and styles to currentColor', () => {
    expect(themeAdaptSvg('<g stroke="#000" fill="#000000"><a fill="black"/></g>')).toBe(
      '<g stroke="currentColor" fill="currentColor"><a fill="currentColor"/></g>',
    );
    expect(themeAdaptSvg('<g style="fill: #000; stroke:black"/>')).toBe(
      '<g style="fill:currentColor; stroke:currentColor"/>',
    );
  });

  it('leaves explicit non-black colors alone', () => {
    const svg = '<g stroke="#0a0" fill="none" color="white"><a fill="#fff" stroke="red"/></g>';
    expect(themeAdaptSvg(svg)).toBe(svg);
  });
});

describe('classifySvg', () => {
  it('merges into an existing class and strips anything before <svg>', () => {
    const out = classifySvg('<?xml?><svg class="typst-doc" viewBox="0 0 1 1"/>', 'typst-svg')!;
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).toContain('class="typst-doc content-svg typst-svg"');
  });

  it('returns null when there is no svg root', () => {
    expect(classifySvg('no svg here', 'tikz-svg')).toBeNull();
  });
});

// Real-compiler smoke tests: exercise the actual node-tikzjax / typst paths
// (including the document/page wrapping) that the fakes above bypass.
describe('real compilers', () => {
  const realCache = mkdtempSync(join(tmpdir(), 'teaman-fence-real-'));
  afterAll(() => rmSync(realCache, { recursive: true, force: true }));

  async function compile(lang: string, source: string) {
    const tree = { type: 'root', children: [code(lang, source)] };
    await remarkFenceSvg({ cacheDir: realCache })(tree as any);
    return (tree.children[0] as any);
  }

  it('typst: compiles math to a content-hugging svg', async () => {
    const node = await compile('typst', '$ x^2 + 1 $');
    expect(node.type).toBe('html');
    expect(node.value).toContain('content-svg typst-svg');
    // The auto page setup hugs the formula — nothing like an A4 canvas.
    const width = parseFloat(node.value.match(/width="([\d.]+)"/)![1]);
    expect(width).toBeLessThan(200);
  });

  it('tikz: compiles a picture through WASM TeX with theme-adapted ink', async () => {
    const node = await compile('tikz', '\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}');
    expect(node.type).toBe('html');
    expect(node.value).toContain('content-svg tikz-svg');
    expect(node.value).toContain('stroke="currentColor"');
  }, 90_000);
});
