import { describe, expect, it } from 'vitest';

import {
  buildReferenceHeadingTree,
  findReferenceSectionMatches,
  type ReferenceSection,
} from '../reference-reader';

const sections: ReferenceSection[] = [
  { depth: 2, slug: 'overview', text: 'Overview', content: 'A quick system map.' },
  {
    depth: 2,
    slug: 'environment-seam',
    text: 'Environment seam',
    content: 'Every build stage receives the same resolved vault path.',
  },
  { depth: 3, slug: 'base-paths', text: 'Base paths', content: 'Normalize URL prefixes once.' },
];

describe('findReferenceSectionMatches', () => {
  it('finds a phrase in section content without regard to case', () => {
    expect(findReferenceSectionMatches(sections, 'RESOLVED vault')).toEqual([
      expect.objectContaining({ slug: 'environment-seam', text: 'Environment seam' }),
    ]);
  });

  it('matches heading text and preserves document order', () => {
    expect(findReferenceSectionMatches(sections, 'path').map(match => match.slug)).toEqual([
      'environment-seam',
      'base-paths',
    ]);
  });

  it('returns contextual excerpts and ignores an empty query', () => {
    const [match] = findReferenceSectionMatches(sections, 'build stage');
    expect(match.excerpt).toContain('build stage');
    expect(findReferenceSectionMatches(sections, '   ')).toEqual([]);
  });
});

describe('buildReferenceHeadingTree', () => {
  it('nests headings beneath the nearest shallower section', () => {
    const tree = buildReferenceHeadingTree([
      { depth: 2, slug: 'types', text: 'Types' },
      { depth: 3, slug: 'scalars', text: 'Scalars' },
      { depth: 4, slug: 'integers', text: 'Integers' },
      { depth: 3, slug: 'compound', text: 'Compound' },
      { depth: 2, slug: 'expressions', text: 'Expressions' },
    ]);

    expect(tree).toEqual([
      expect.objectContaining({
        slug: 'types',
        children: [
          expect.objectContaining({
            slug: 'scalars',
            children: [expect.objectContaining({ slug: 'integers' })],
          }),
          expect.objectContaining({ slug: 'compound', children: [] }),
        ],
      }),
      expect.objectContaining({ slug: 'expressions', children: [] }),
    ]);
  });

  it('keeps an orphaned deep heading reachable at the root', () => {
    expect(buildReferenceHeadingTree([
      { depth: 3, slug: 'details', text: 'Details' },
    ])).toEqual([
      expect.objectContaining({ slug: 'details', children: [] }),
    ]);
  });
});
