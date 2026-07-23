import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('astro:content', () => ({
  getCollection: vi.fn(),
}));

import { getCollection } from 'astro:content';
import {
  adrRelations,
  adrNum,
  adrMatches,
  adrMatchesRules,
  byNum,
  groupByYear,
  primaryAdrRelation,
  statusCounts,
  tagCounts,
  loadAdrs,
} from '../adr';

const mockGetCollection = vi.mocked(getCollection);

describe('adrNum', () => {
  it('parses the zero-padded number out of an adr-NNNN id', () => {
    expect(adrNum('adr-0001')).toBe('0001');
    expect(adrNum('adr-0018')).toBe('0018');
  });
  it('falls back to the whole id when there are no digits', () => {
    expect(adrNum('intro')).toBe('intro');
  });
});

describe('adrMatches', () => {
  const card = { status: 'accepted', tags: ['api', 'data'] };

  it('matches when the status is selected and no tags are filtered', () => {
    expect(adrMatches(card, { statuses: new Set(['accepted']), tags: new Set() })).toBe(true);
  });
  it('rejects when the status is not selected', () => {
    expect(adrMatches(card, { statuses: new Set(['proposed']), tags: new Set() })).toBe(false);
  });
  it('matches when the card carries at least one active tag', () => {
    expect(adrMatches(card, { statuses: new Set(['accepted']), tags: new Set(['data']) })).toBe(true);
  });
  it('rejects when no card tag is active', () => {
    expect(adrMatches(card, { statuses: new Set(['accepted']), tags: new Set(['auth']) })).toBe(false);
  });
});

describe('adrMatchesRules', () => {
  const card = { status: 'accepted', tags: ['api', 'data'] };

  it('matches when no ReUI filters are active', () => {
    expect(adrMatchesRules(card, [])).toBe(true);
  });

  it('supports inclusive and exclusive status filters', () => {
    expect(adrMatchesRules(card, [
      { field: 'status', operator: 'is_any_of', values: ['accepted'] },
    ])).toBe(true);
    expect(adrMatchesRules(card, [
      { field: 'status', operator: 'is_not_any_of', values: ['accepted'] },
    ])).toBe(false);
  });

  it('supports any, all, and excluded tag filters', () => {
    expect(adrMatchesRules(card, [
      { field: 'tag', operator: 'is_any_of', values: ['auth', 'data'] },
    ])).toBe(true);
    expect(adrMatchesRules(card, [
      { field: 'tag', operator: 'includes_all', values: ['api', 'data'] },
    ])).toBe(true);
    expect(adrMatchesRules(card, [
      { field: 'tag', operator: 'excludes_all', values: ['api'] },
    ])).toBe(false);
  });

  it('treats an empty value selection as inactive', () => {
    expect(adrMatchesRules(card, [
      { field: 'tag', operator: 'is_any_of', values: [] },
    ])).toBe(true);
  });
});

describe('groupByYear', () => {
  it('groups by year, newest first, preserving item order', () => {
    const list = [
      { num: '3', date: '2024-05-30' },
      { num: '2', date: '2024-01-10' },
      { num: '1', date: '2023-02-02' },
    ];
    const groups = groupByYear(list);
    expect(groups.map((g) => g.year)).toEqual(['2024', '2023']);
    expect(groups[0].items.map((i) => i.num)).toEqual(['3', '2']);
    expect(groups[1].items.map((i) => i.num)).toEqual(['1']);
  });
});

describe('statusCounts', () => {
  it('zero-fills every status', () => {
    const counts = statusCounts([{ status: 'accepted' }, { status: 'accepted' }, { status: 'proposed' }]);
    expect(counts).toEqual({ accepted: 2, proposed: 1, superseded: 0 });
  });
});

describe('tagCounts', () => {
  it('sorts by frequency then name', () => {
    const counts = tagCounts([{ tags: ['api', 'data'] }, { tags: ['api'] }, { tags: ['data'] }]);
    expect(counts).toEqual([
      { tag: 'api', count: 2 },
      { tag: 'data', count: 2 },
    ]);
  });

  it('returns no filter options when ADRs have no tags', () => {
    expect(tagCounts([{ tags: [] }, { tags: [] }])).toEqual([]);
  });
});

describe('byNum', () => {
  it('indexes records by their num', () => {
    const map = byNum([{ num: '0001' }, { num: '0002' }]);
    expect(map.get('0002')).toEqual({ num: '0002' });
  });
});

describe('adrRelations', () => {
  type TestAdr = { num: string; title?: string; supersedes?: string; supersededBy?: string };
  const index = byNum<TestAdr>([
    { num: '0001', title: 'Old' },
    { num: '0002', title: 'Current', supersedes: '0001', supersededBy: '0003' },
    { num: '0003', title: 'New' },
  ]);

  it('returns ordered lineage links for known targets', () => {
    expect(adrRelations(index.get('0002')!, index)).toEqual([
      { kind: 'supersedes', num: '0001', dir: 'l', target: index.get('0001') },
      { kind: 'supersededBy', num: '0003', dir: 'r', target: index.get('0003') },
    ]);
  });

  it('ignores missing lineage targets', () => {
    const adr: TestAdr = { num: '0004', supersedes: '4040' };
    expect(adrRelations(adr, index)).toEqual([]);
  });
});

describe('primaryAdrRelation', () => {
  it('prefers successor links over predecessor links', () => {
    const index = byNum([
      { num: '0001' },
      { num: '0002', supersedes: '0001', supersededBy: '0003' },
      { num: '0003' },
    ]);

    expect(primaryAdrRelation(index.get('0002')!, index)).toMatchObject({
      kind: 'supersededBy',
      num: '0003',
    });
  });
});

describe('loadAdrs', () => {
  beforeEach(() => mockGetCollection.mockReset());

  it('flattens the collection and sorts newest first', async () => {
    mockGetCollection.mockResolvedValue([
      {
        id: 'adr-0001',
        body: '',
        data: { title: 'First', date: new Date('2023-01-10'), status: 'accepted', tags: ['x'] },
      },
      {
        id: 'adr-0002',
        body: '',
        data: { title: 'Second', date: new Date('2024-02-02'), status: 'proposed' },
      },
    ] as never);

    const list = await loadAdrs();
    expect(list.map((a) => a.num)).toEqual(['0002', '0001']);
    expect(list[0]).toMatchObject({ title: 'Second', date: '2024-02-02', status: 'proposed', tags: [] });
    expect(list[1]).toMatchObject({ date: '2023-01-10', tags: ['x'] });
  });
});
