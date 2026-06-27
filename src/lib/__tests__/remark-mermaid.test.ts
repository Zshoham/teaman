import { describe, it, expect } from 'vitest';
import { remarkMermaid } from '../remark-mermaid.mjs';

// Minimal mdast-compatible node factories.
const code = (lang: string | null, value: string) => ({ type: 'code', lang, value });
const p = () => ({ type: 'paragraph', children: [] });

function run(children: object[]) {
  const tree = { type: 'root', children: [...children] };
  remarkMermaid()(tree as any);
  return tree.children as any[];
}

describe('remarkMermaid', () => {
  it('converts a mermaid fence into a <pre class="mermaid"> html node', () => {
    const result = run([code('mermaid', 'graph TD\n  A --> B')]);
    expect(result[0]).toEqual({
      type: 'html',
      value: '<pre class="mermaid">graph TD\n  A --&gt; B</pre>',
    });
  });

  it('leaves other code fences untouched', () => {
    const js = code('js', 'const x = 1;');
    const result = run([js]);
    expect(result[0]).toBe(js);
  });

  it('leaves a plain (langless) code fence untouched', () => {
    const result = run([code(null, 'mermaid')]);
    expect(result[0]).toMatchObject({ type: 'code', lang: null });
  });

  it('escapes HTML-special characters in the diagram source', () => {
    const result = run([code('mermaid', 'A --> B & "C" <d>')]);
    expect(result[0].value).toBe(
      '<pre class="mermaid">A --&gt; B &amp; "C" &lt;d&gt;</pre>',
    );
  });

  it('transforms mermaid fences nested inside other containers', () => {
    const result = run([
      { type: 'blockquote', children: [code('mermaid', 'graph TD')] },
    ]);
    expect(result[0].children[0]).toEqual({
      type: 'html',
      value: '<pre class="mermaid">graph TD</pre>',
    });
  });

  it('leaves a document with no mermaid fences unchanged', () => {
    const result = run([p(), code('ts', 'let y = 2;')]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ type: 'code', lang: 'ts' });
  });
});
