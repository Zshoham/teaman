import { describe, expect, it } from 'vitest';

import { coalesceFilterRules, matchesFilterRules, retainMeaningfulRules } from '../filter-rules';

describe('matchesFilterRules', () => {
  const entry = { type: ['note'], tag: ['architecture', 'meta'] };

  it('matches multiple values from one field with OR semantics', () => {
    expect(matchesFilterRules(entry, [
      { field: 'type', operator: 'is_any_of', values: ['guide', 'note'] },
    ])).toBe(true);
  });

  it('combines different fields with AND semantics', () => {
    expect(matchesFilterRules(entry, [
      { field: 'type', operator: 'is_any_of', values: ['note'] },
      { field: 'tag', operator: 'includes_all', values: ['architecture', 'meta'] },
    ])).toBe(true);
    expect(matchesFilterRules(entry, [
      { field: 'type', operator: 'is_any_of', values: ['note'] },
      { field: 'tag', operator: 'is_any_of', values: ['testing'] },
    ])).toBe(false);
  });
});

describe('coalesceFilterRules', () => {
  it('merges repeated field/operator terms into one rule', () => {
    expect(coalesceFilterRules([
      { id: 'first', field: 'type', operator: 'is_any_of', values: ['note'] },
      { id: 'second', field: 'type', operator: 'is_any_of', values: ['guide', 'note'] },
    ])).toEqual([
      { id: 'second', field: 'type', operator: 'is_any_of', values: ['note', 'guide'] },
    ]);
  });

  it('keeps different operators as independent rules', () => {
    expect(coalesceFilterRules([
      { field: 'tag', operator: 'is_any_of', values: ['architecture'] },
      { field: 'tag', operator: 'is_not_any_of', values: ['draft'] },
    ])).toHaveLength(2);
  });
});

describe('retainMeaningfulRules', () => {
  it('drops value-less rules, which match everything', () => {
    expect(retainMeaningfulRules([
      { field: 'tag', operator: 'is_any_of', values: [] },
      { field: 'type', operator: 'is_any_of', values: ['note'] },
    ])).toEqual([{ field: 'type', operator: 'is_any_of', values: ['note'] }]);
  });

  it('keeps empty / not_empty, whose meaning is the operator', () => {
    const rules = [
      { field: 'tag', operator: 'empty', values: [] },
      { field: 'tag', operator: 'not_empty', values: [] },
    ];
    expect(retainMeaningfulRules(rules)).toEqual(rules);
  });

  it('keeps a cleared chip for the preselected field so the picker stays put', () => {
    const rules = [{ field: 'tag', operator: 'is_any_of', values: [] }];
    expect(retainMeaningfulRules(rules, { keepField: 'tag' })).toEqual(rules);
    expect(retainMeaningfulRules(rules, { keepField: 'type' })).toEqual([]);
  });
});
