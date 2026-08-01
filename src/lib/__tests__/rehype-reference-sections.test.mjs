import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { rehypeReferenceSections } from '../rehype-reference-sections.mjs';

const referencesRoot = join('/vault', 'references');

const element = (tagName, children = [], properties = {}) => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = value => ({ type: 'text', value });
const heading = (tagName, value) => element(tagName, [text(value)], { id: value });
const paragraph = value => element('p', [text(value)]);

function run(children, path = join(referencesRoot, 'guide.md')) {
  const tree = { type: 'root', children };
  rehypeReferenceSections({ referencesRoot })(tree, { path });
  return tree;
}

const intrinsic = node => Number(/auto (\d+)px/.exec(node.properties.style ?? '')?.[1] ?? 0);

describe('rehypeReferenceSections', () => {
  it('groups the document into one section per h2 chapter', () => {
    const tree = run([
      paragraph('Preamble.'),
      heading('h2', 'first'),
      paragraph('One.'),
      heading('h3', 'nested'),
      heading('h2', 'second'),
      paragraph('Two.'),
    ]);

    expect(tree.children).toHaveLength(3);
    expect(tree.children.every(node => node.tagName === 'section')).toBe(true);
    expect(tree.children.every(node => node.properties.className.includes('reference-chapter'))).toBe(true);
    // The lead-in before the first h2 stays its own chapter rather than being
    // folded into the one that follows it.
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[1].children.map(node => node.tagName)).toEqual(['h2', 'p', 'h3']);
    expect(tree.children[2].children.map(node => node.tagName)).toEqual(['h2', 'p']);
  });

  it('leaves headings and their ids untouched', () => {
    const tree = run([heading('h2', 'alpha'), paragraph('Body.'), heading('h2', 'beta')]);
    const ids = tree.children.flatMap(section =>
      section.children.filter(node => node.tagName === 'h2').map(node => node.properties.id),
    );
    expect(ids).toEqual(['alpha', 'beta']);
  });

  it('sizes each chapter so the document reports a realistic height up front', () => {
    const tree = run([
      heading('h2', 'short'),
      paragraph('Tiny.'),
      heading('h2', 'long'),
      element('pre', [text(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'))]),
    ]);

    const [short, long] = tree.children.map(intrinsic);
    expect(short).toBeGreaterThan(0);
    // A 40-line code block must not be estimated at the same height as one
    // short paragraph, or the scrollbar stretches as chapters render.
    expect(long).toBeGreaterThan(short * 3);
    expect(long).toBeGreaterThan(40 * 20);
  });

  it('ignores documents outside the references root', () => {
    const children = [heading('h2', 'a'), paragraph('x'), heading('h2', 'b')];
    const tree = run(children, join('/vault', 'notes', 'a-note.md'));
    expect(tree.children.map(node => node.tagName)).toEqual(['h2', 'p', 'h2']);
  });

  it('leaves a document with a single chapter alone', () => {
    const tree = run([heading('h2', 'only'), paragraph('Body.')]);
    expect(tree.children.map(node => node.tagName)).toEqual(['h2', 'p']);
  });
});
