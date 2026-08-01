// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { collectReferenceSections } from '../reference-reader';

describe('collectReferenceSections', () => {
  it('indexes prose before the first heading and points it at the document start', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = [
      '<p>Overview text before any named section.</p>',
      '<h2 id="details">Details</h2>',
      '<p>Section body.</p>',
    ].join('');

    expect(collectReferenceSections(content, [
      { depth: 2, slug: 'details', text: 'Details' },
    ])).toEqual([
      {
        depth: 2,
        slug: 'reference-content',
        text: 'Introduction',
        content: ' Overview text before any named section.',
      },
      {
        depth: 2,
        slug: 'details',
        text: 'Details',
        content: ' Section body.',
      },
    ]);
  });

  it('makes a headingless reference one searchable introduction section', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = '<p>A complete document without section headings.</p>';

    expect(collectReferenceSections(content, [])).toEqual([
      expect.objectContaining({
        slug: 'reference-content',
        content: ' A complete document without section headings.',
      }),
    ]);
  });

  it('sees through contained chapter wrappers without losing the preamble', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = [
      '<section class="reference-chapter"><p>Preamble.</p></section>',
      '<section class="reference-chapter"><h2 id="chapter">Chapter</h2><p>Body.</p></section>',
    ].join('');

    expect(collectReferenceSections(content, [
      { depth: 2, slug: 'chapter', text: 'Chapter' },
    ]).map(section => section.slug)).toEqual(['reference-content', 'chapter']);
  });
});
