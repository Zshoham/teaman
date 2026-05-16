import { describe, it, expect } from 'vitest';
import { remarkStripLeadingH1 } from '../remark-strip-h1.mjs';

// Minimal mdast-compatible node factories.
const h = (depth: number) => ({ type: 'heading', depth, children: [] });
const p = () => ({ type: 'paragraph', children: [] });
const yaml = () => ({ type: 'yaml', value: 'title: Test' });
const toml = () => ({ type: 'toml', value: 'title = "Test"' });

function run(children: object[]) {
  const tree = { children: [...children] };
  remarkStripLeadingH1()(tree as any);
  return tree.children;
}

describe('remarkStripLeadingH1', () => {
  it('removes a leading H1', () => {
    expect(run([h(1), p()])).toEqual([p()]);
  });

  it('does not remove a non-leading H1', () => {
    expect(run([p(), h(1)])).toHaveLength(2);
  });

  it('does not remove a leading H2', () => {
    expect(run([h(2), p()])).toHaveLength(2);
    expect(run([h(2), p()])[0]).toMatchObject({ type: 'heading', depth: 2 });
  });

  it('removes H1 that follows a yaml frontmatter node', () => {
    const result = run([yaml(), h(1), p()]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'yaml' });
    expect(result[1]).toMatchObject({ type: 'paragraph' });
  });

  it('removes H1 that follows a toml frontmatter node', () => {
    const result = run([toml(), h(1), p()]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'toml' });
  });

  it('removes H1 that follows multiple frontmatter nodes', () => {
    const result = run([yaml(), toml(), h(1), p()]);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({ type: 'paragraph' });
  });

  it('does nothing on an empty document', () => {
    expect(run([])).toHaveLength(0);
  });

  it('does nothing when the first content node is a paragraph', () => {
    expect(run([p(), h(1)])).toHaveLength(2);
  });

  it('handles a document with only frontmatter (no H1)', () => {
    expect(run([yaml()])).toHaveLength(1);
  });
});
