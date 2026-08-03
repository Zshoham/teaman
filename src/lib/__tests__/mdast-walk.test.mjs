import { describe, it, expect } from 'vitest';
import { replaceChildren } from '../mdast-walk.mjs';

const text = (value) => ({ type: 'text', value });
const parent = (type, ...children) => ({ type, children });

describe('replaceChildren', () => {
  it('replaces a node when the visitor returns one', () => {
    const tree = parent('root', text('a'), text('b'));
    replaceChildren(tree, (node) => (node.value === 'b' ? text('B') : undefined));
    expect(tree.children.map(c => c.value)).toEqual(['a', 'B']);
  });

  it('descends into nodes the visitor passes on (undefined)', () => {
    const tree = parent('root', parent('blockquote', parent('paragraph', text('deep'))));
    replaceChildren(tree, (node) => (node.value === 'deep' ? text('found') : undefined));
    expect(tree.children[0].children[0].children[0].value).toBe('found');
  });

  it('does not descend into a node it replaced', () => {
    const seen = [];
    const tree = parent('root', parent('paragraph', text('inner')));
    replaceChildren(tree, (node) => {
      seen.push(node.type);
      return node.type === 'paragraph' ? { type: 'html', value: '<p>' } : undefined;
    });
    expect(seen).toEqual(['paragraph']);
    expect(tree.children[0]).toEqual({ type: 'html', value: '<p>' });
  });

  // `null` is how a plugin says "mine, but unchanged" — remark-inline-svg uses
  // it for an image it could not resolve, which must not then be re-visited as
  // a bare inline image one level down.
  it('leaves a node alone but stops descending when the visitor returns null', () => {
    const seen = [];
    const tree = parent('root', parent('paragraph', text('inner')));
    replaceChildren(tree, (node) => {
      seen.push(node.type);
      return node.type === 'paragraph' ? null : undefined;
    });
    expect(seen).toEqual(['paragraph']);
    expect(tree.children[0].type).toBe('paragraph');
  });

  it('passes the parent and index of each visited node', () => {
    const tree = parent('root', text('a'), text('b'));
    const calls = [];
    replaceChildren(tree, (node, parentNode, index) => {
      calls.push([node.value, parentNode.type, index]);
      return undefined;
    });
    expect(calls).toEqual([['a', 'root', 0], ['b', 'root', 1]]);
  });

  it('ignores leaves and childless nodes', () => {
    const tree = parent('root', { type: 'thematicBreak' }, text('x'));
    expect(() => replaceChildren(tree, () => undefined)).not.toThrow();
    expect(tree.children).toHaveLength(2);
  });
});
