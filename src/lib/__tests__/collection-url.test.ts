import { describe, expect, it } from 'vitest';
import { readCollectionFilters, readCollectionView, writeCollectionFilters } from '../collection-url';

describe('collection URLs', () => {
  it('round-trips multiple values and operators without losing unrelated parameters or fragments', () => {
    const rules = [
      { field: 'tag', operator: 'is_any_of', values: ['a,b', 'C++', 'עברית'] },
      { field: 'tag', operator: 'includes_all', values: ['design', 'ux'] },
      { field: 'type', operator: 'is_not_any_of', values: ['daily'] },
    ];
    const url = writeCollectionFilters(new URL('https://example.com/notes/?campaign=x&tag=old#entries'), rules);
    expect(readCollectionFilters(url.searchParams).map(({ id, ...rule }) => rule)).toEqual([rules[2], rules[0], rules[1]]);
    expect(url.searchParams.get('campaign')).toBe('x');
    expect(url.hash).toBe('#entries');
    writeCollectionFilters(url, []);
    expect(url.search).toBe('?campaign=x');
  });

  it('ignores unsupported rules and empty values', () => {
    expect(readCollectionFilters(new URLSearchParams('tag=&tag=x&tag=x&tag.invalid=y'))).toEqual([
      { id: 'url-tag', field: 'tag', operator: 'is_any_of', values: ['x'] },
    ]);
  });

  it('defaults invalid view parameters safely', () => {
    for (const page of ['-1', '0', '1.5', 'Infinity', 'garbage']) {
      expect(readCollectionView(new URLSearchParams(`page=${page}&sort=no`))).toEqual({ page: 1, sort: 'desc' });
    }
    expect(readCollectionView(new URLSearchParams('page=3&sort=asc'))).toEqual({ page: 3, sort: 'asc' });
  });
});
