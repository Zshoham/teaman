import { describe, it, expect } from 'vitest';
import { remarkFencePre, remarkMermaid, remarkPlantuml } from '../remark-fence-pre.mjs';

// Minimal mdast-compatible node factories.
const code = (lang: string | null, value: string) => ({ type: 'code', lang, value });
const p = () => ({ type: 'paragraph', children: [] });

// The two client-rendered diagram languages are the same plugin with a
// different fence name, so they are exercised as one parameterized suite.
const LANGUAGES = [
  { lang: 'mermaid', plugin: remarkMermaid, source: 'graph TD\n  A --> B', escaped: 'graph TD\n  A --&gt; B' },
  { lang: 'plantuml', plugin: remarkPlantuml, source: '@startuml\nA -> B\n@enduml', escaped: '@startuml\nA -&gt; B\n@enduml' },
] as const;

describe.each(LANGUAGES)('remarkFencePre($lang)', ({ lang, plugin, source, escaped }) => {
  function run(children: object[]) {
    const tree = { type: 'root', children: [...children] };
    plugin()(tree as any);
    return tree.children as any[];
  }

  it(`converts a ${lang} fence into a <pre class="${lang}"> html node`, () => {
    expect(run([code(lang, source)])[0]).toEqual({
      type: 'html',
      value: `<pre class="${lang}">${escaped}</pre>`,
    });
  });

  it('leaves other code fences untouched', () => {
    const js = code('js', 'const x = 1;');
    expect(run([js])[0]).toBe(js);
  });

  it('leaves a plain (langless) code fence untouched', () => {
    expect(run([code(null, lang)])[0]).toMatchObject({ type: 'code', lang: null });
  });

  it('escapes HTML-special characters in the diagram source', () => {
    expect(run([code(lang, 'A --> B & "C" <d>')])[0].value).toBe(
      `<pre class="${lang}">A --&gt; B &amp; "C" &lt;d&gt;</pre>`,
    );
  });

  it(`transforms ${lang} fences nested inside other containers`, () => {
    const result = run([{ type: 'blockquote', children: [code(lang, source)] }]);
    expect(result[0].children[0]).toEqual({
      type: 'html',
      value: `<pre class="${lang}">${escaped}</pre>`,
    });
  });

  it(`leaves a document with no ${lang} fences unchanged`, () => {
    const result = run([p(), code('ts', 'let y = 2;')]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ type: 'code', lang: 'ts' });
  });
});

describe('remarkFencePre', () => {
  it('builds a plugin for any fence language', () => {
    const tree = { type: 'root', children: [code('dot', 'digraph {}')] };
    remarkFencePre('dot')()(tree as any);
    expect(tree.children[0]).toEqual({
      type: 'html',
      value: '<pre class="dot">digraph {}</pre>',
    });
  });
});
