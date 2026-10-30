import { describe, expect, it } from 'vitest';
import { rehypeRawSvg } from '../rehype-raw-svg.mjs';

const raw = value => ({ type: 'raw', value });
const el = (tagName, children) => ({ type: 'element', tagName, properties: {}, children });
const SVG = '<svg viewBox="0 0 640 1"></svg>';
const WRAPPED = '<div class="diagram-scroll" style="--diagram-width: 640px"><svg viewBox="0 0 640 1"></svg></div>';

function run(tree) {
  rehypeRawSvg()(tree);
  return tree;
}

describe('rehypeRawSvg', () => {
  it('wraps a block svg in the document, a quote, and a list item', () => {
    const tree = run({ type: 'root', children: [raw(SVG), el('blockquote', [raw(SVG)]), el('ul', [el('li', [raw(SVG)])])] });
    expect(tree.children[0].value).toBe(WRAPPED);
    expect(tree.children[1].children[0].value).toBe(WRAPPED);
    expect(tree.children[2].children[0].children[0].value).toBe(WRAPPED);
  });

  it('leaves inline svg in a paragraph, heading or table cell alone', () => {
    const tree = run({ type: 'root', children: [el('p', [raw(SVG)]), el('h2', [raw(SVG)]), el('table', [el('tr', [el('td', [raw(SVG)])])])] });
    expect(tree.children[0].children[0].value).toBe(SVG);
    expect(tree.children[1].children[0].value).toBe(SVG);
    expect(tree.children[2].children[0].children[0].children[0].value).toBe(SVG);
  });
});
