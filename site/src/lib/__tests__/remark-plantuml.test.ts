import { describe, it, expect } from 'vitest';
import { remarkPlantuml } from '../remark-plantuml.mjs';

// Minimal mdast-compatible node factories.
const code = (lang: string | null, value: string) => ({ type: 'code', lang, value });
const p = () => ({ type: 'paragraph', children: [] });

function run(children: object[]) {
  const tree = { type: 'root', children: [...children] };
  remarkPlantuml()(tree as any);
  return tree.children as any[];
}

describe('remarkPlantuml', () => {
  it('converts a plantuml fence into a <pre class="plantuml"> html node', () => {
    const result = run([code('plantuml', '@startuml\nA -> B\n@enduml')]);
    expect(result[0]).toEqual({
      type: 'html',
      value: '<pre class="plantuml">@startuml\nA -&gt; B\n@enduml</pre>',
    });
  });

  it('leaves other code fences untouched', () => {
    const js = code('js', 'const x = 1;');
    const result = run([js]);
    expect(result[0]).toBe(js);
  });

  it('leaves a plain (langless) code fence untouched', () => {
    const result = run([code(null, 'plantuml')]);
    expect(result[0]).toMatchObject({ type: 'code', lang: null });
  });

  it('escapes HTML-special characters in the diagram source', () => {
    const result = run([code('plantuml', 'A --> B & "C" <d>')]);
    expect(result[0].value).toBe(
      '<pre class="plantuml">A --&gt; B &amp; "C" &lt;d&gt;</pre>',
    );
  });

  it('transforms plantuml fences nested inside other containers', () => {
    const result = run([
      { type: 'blockquote', children: [code('plantuml', '@startuml\n@enduml')] },
    ]);
    expect(result[0].children[0]).toEqual({
      type: 'html',
      value: '<pre class="plantuml">@startuml\n@enduml</pre>',
    });
  });

  it('leaves a document with no plantuml fences unchanged', () => {
    const result = run([p(), code('ts', 'let y = 2;')]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ type: 'code', lang: 'ts' });
  });
});
