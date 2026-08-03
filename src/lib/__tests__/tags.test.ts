import { describe, expect, it } from 'vitest';

import { tagCounts } from '../tags';
import { buildTopics } from '../collection-index';
import { tagCounts as adrTagCounts } from '../adr-shared';

describe('tagCounts', () => {
  it('counts tags across records', () => {
    expect(tagCounts([
      { tags: ['api', 'data'] },
      { tags: ['api'] },
      { tags: ['data'] },
    ])).toEqual([
      { tag: 'api', count: 2 },
      { tag: 'data', count: 2 },
    ]);
  });

  it('orders by frequency, then alphabetically', () => {
    expect(tagCounts([
      { tags: ['zebra', 'api'] },
      { tags: ['api'] },
      { tags: ['api'] },
      { tags: ['bison'] },
    ])).toEqual([
      { tag: 'api', count: 3 },
      { tag: 'bison', count: 1 },
      { tag: 'zebra', count: 1 },
    ]);
  });

  it('returns nothing for untagged records', () => {
    expect(tagCounts([{ tags: [] }, { tags: [] }])).toEqual([]);
  });

  // The collection indexes and the ADR timeline used to carry their own copies.
  it('is the single implementation behind both consumers', () => {
    expect(buildTopics).toBe(tagCounts);
    expect(adrTagCounts).toBe(tagCounts);
  });
});
