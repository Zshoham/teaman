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

describe('rehypeFlexibleCallouts', () => {
  it('renders non-standard callout types with a humanized fallback title', () => {
    const tree = calloutTree('[!EDITION-2018]');

    rehypeFlexibleCallouts()(tree);

    const callout = tree.children[0];
    expect(callout.tagName).toBe('div');
    expect(callout.properties).toMatchObject({
      className: ['callout'],
      'data-callout': 'edition-2018',
      'data-collapsible': 'false',
    });
    expect(callout.children[0].children[0].children[0].value).toBe('Edition 2018');
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
    expect(callout.children[0].children[0].children[0].value).toBe('Supported versions');
  });

  it('preserves built-in callout indicators', () => {
    const tree = calloutTree('[!NOTE]');

    rehypeFlexibleCallouts()(tree);

    const titleChildren = tree.children[0].children[0].children;
    expect(titleChildren[0].properties.className).toContain('callout-title-icon');
    expect(titleChildren[1].children[0].value).toBe('Note');
  });
});
