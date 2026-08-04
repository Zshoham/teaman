import { describe, expect, it } from 'vitest';

import { rehypeCodeBlocks } from '../rehype-code-blocks.mjs';

const text = value => ({ type: 'text', value });
const element = (tagName, children = [], properties = {}) => ({
  type: 'element',
  tagName,
  properties,
  children,
});

function run(children) {
  const tree = { type: 'root', children };
  rehypeCodeBlocks()(tree);
  return tree;
}

describe('rehypeCodeBlocks', () => {
  it('wraps a Shiki block with its language and a copy button', () => {
    const pre = element('pre', [element('code', [text('const answer = 42;')])], {
      // Astro's Shiki HAST uses the literal `class` property here rather than
      // the `className` array produced by most rehype plugins.
      class: 'astro-code github-light',
      dataLanguage: 'typescript',
    });

    const tree = run([pre]);
    const wrapper = tree.children[0];
    const [toolbar, renderedPre] = wrapper.children;
    const [language, button] = toolbar.children;

    expect(wrapper.tagName).toBe('div');
    expect(wrapper.properties).toMatchObject({
      className: ['code-block'],
      dataCodeBlock: '',
      dataLanguage: 'typescript',
    });
    expect(language.children[0].value).toBe('typescript');
    expect(button.properties).toMatchObject({
      type: 'button',
      dataCopyCode: '',
      ariaLabel: 'Copy typescript code',
    });
    expect(button.children[0].value).toBe('Copy');
    expect(renderedPre).toBe(pre);
  });

  it('shows Astro\'s plaintext fallback for an unlabelled fence', () => {
    const tree = run([
      element('pre', [element('code', [text('plain')])], {
        className: ['astro-code'],
        'data-language': 'plaintext',
      }),
    ]);

    expect(tree.children[0].properties.dataLanguage).toBe('plaintext');
    expect(tree.children[0].children[0].children[0].children[0].value).toBe('plaintext');
  });

  it('leaves diagram and ordinary pre elements untouched', () => {
    const mermaid = element('pre', [text('graph TD')], { className: ['mermaid'] });
    const ordinary = element('pre', [text('output')]);
    const tree = run([mermaid, ordinary]);

    expect(tree.children).toEqual([mermaid, ordinary]);
  });

  it('does not wrap an already decorated block again', () => {
    const tree = run([
      element('pre', [element('code', [text('echo hello')])], {
        className: ['astro-code'],
        dataLanguage: 'bash',
      }),
    ]);

    rehypeCodeBlocks()(tree);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].properties.className).toEqual(['code-block']);
    expect(tree.children[0].children[1].tagName).toBe('pre');
  });
});
