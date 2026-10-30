import { describe, expect, it } from 'vitest';
import { rehypeFlexibleCallouts } from '../rehype-flexible-callouts.mjs';

function calloutTree(marker, body = 'Callout body') {
  return {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [
        { type: 'text', value: '\n' },
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [{ type: 'text', value: `${marker}\n${body}` }],
        },
        { type: 'text', value: '\n' },
      ],
    }],
  };
}

function hasClass(node, name) {
  return [node?.properties?.className ?? []].flat().includes(name);
}

function textOf(node) {
  return node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('');
}

/** The callout's title parts: its type tag, title text and fold icon. */
function titleParts(callout) {
  const children = callout.children[0].children;
  const tag = children.find(child => hasClass(child, 'callout-tag'));
  return {
    children,
    tag,
    icon: tag?.children.find(child => hasClass(child, 'callout-title-icon')),
    label: tag && textOf(tag.children.find(child => hasClass(child, 'callout-tag-label'))),
    text: children.find(child => hasClass(child, 'callout-title-text')),
    fold: children.find(child => hasClass(child, 'callout-fold-icon')),
  };
}

describe('rehypeFlexibleCallouts', () => {
  it('renders non-standard callout types with a humanized type tag', () => {
    const tree = calloutTree('[!EDITION-2018]');

    rehypeFlexibleCallouts()(tree);

    const callout = tree.children[0];
    expect(callout.tagName).toBe('div');
    expect(callout.properties).toMatchObject({
      className: ['callout'],
      'data-callout': 'edition-2018',
      'data-collapsible': 'false',
    });
    expect(titleParts(callout).label).toBe('Edition 2018');
    expect(callout.children[1].children[0].children[0].value).toBe('Callout body');
  });

  it('keeps explicit custom titles and collapsibility', () => {
    const tree = calloutTree('[!release_train]+ Supported versions');

    rehypeFlexibleCallouts()(tree);

    const callout = tree.children[0];
    expect(callout.tagName).toBe('details');
    expect(callout.properties).toMatchObject({
      'data-callout': 'release_train',
      'data-collapsible': 'true',
      open: 'open',
    });
    expect(textOf(titleParts(callout).text)).toBe('Supported versions');
  });

  it('keeps built-in indicators inside the type tag', () => {
    const tree = calloutTree('[!WARNING] Two slips');

    rehypeFlexibleCallouts()(tree);

    const { children, tag, icon, label, text } = titleParts(tree.children[0]);
    expect(children[0]).toBe(tag);
    expect(tag.properties).toMatchObject({ dataPagefindIgnore: '' });
    expect(icon.properties.ariaHidden).toBe('true');
    // The theme's own warning triangle, not the fallback pencil.
    expect(JSON.stringify(icon)).not.toContain('M16.5 3.5');
    expect(label).toBe('Warning');
    expect(textOf(text)).toBe('Two slips');
  });

  it('gives a vault-defined type the fallback icon', () => {
    const tree = calloutTree('[!release_train]');

    rehypeFlexibleCallouts()(tree);

    const { icon, label } = titleParts(tree.children[0]);
    expect(icon.properties).toMatchObject({ className: ['callout-title-icon'], ariaHidden: 'true' });
    expect(icon.children[0].tagName).toBe('svg');
    expect(label).toBe('Release Train');
  });

  it.each(['[!note] Title', '[!release_train] Title'])('adds no icon to %s when indicators are off', marker => {
    const tree = calloutTree(marker);

    rehypeFlexibleCallouts({ showIndicator: false })(tree);

    const { tag, icon, label } = titleParts(tree.children[0]);
    expect(icon).toBeUndefined();
    expect(tag.children).toHaveLength(1);
    expect(label).toBeTruthy();
  });

  it.each([
    ['no title', '[!note]'],
    ['a title that only names the type', '[!note] note'],
  ])('drops the title text when the callout has %s', (_, marker) => {
    const tree = calloutTree(marker);

    rehypeFlexibleCallouts()(tree);

    const { children, label, text } = titleParts(tree.children[0]);
    expect(label).toBe('Note');
    expect(text).toBeUndefined();
    expect(children).toHaveLength(1);
  });

  it.each(['a', 'code'])('keeps a title that names the type in an <%s>', tagName => {
    const tree = calloutTree('');
    tree.children[0].children[1].children = [
      { type: 'text', value: '[!note] ' },
      { type: 'element', tagName, properties: {}, children: [{ type: 'text', value: 'note' }] },
      { type: 'text', value: '\nbody' },
    ];

    rehypeFlexibleCallouts()(tree);

    expect(titleParts(tree.children[0]).text.children[0].tagName).toBe(tagName);
  });

  it('tags a callout once when run over the same tree twice', () => {
    const tree = calloutTree('[!warning] Two slips');

    rehypeFlexibleCallouts()(tree);
    const once = structuredClone(tree);
    rehypeFlexibleCallouts()(tree);

    expect(tree).toEqual(once);
  });

  it('keeps the fold icon after the title in a foldable callout', () => {
    const tree = calloutTree('[!example]- One week');

    rehypeFlexibleCallouts()(tree);

    const { children, tag, text, fold } = titleParts(tree.children[0]);
    expect(children).toEqual([tag, text, fold]);
  });

  it('tags callouts nested inside a callout', () => {
    const tree = calloutTree('[!note] Outer');
    tree.children[0].children.push({
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [{ type: 'text', value: '[!tip] Inner\nbody' }],
      }],
    });

    rehypeFlexibleCallouts()(tree);

    const inner = tree.children[0].children[1].children.find(child => hasClass(child, 'callout'));
    expect(titleParts(inner).label).toBe('Tip');
    expect(textOf(titleParts(inner).text)).toBe('Inner');
  });
});
