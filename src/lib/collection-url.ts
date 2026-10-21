import { coalesceFilterRules, retainMeaningfulRules, type FilterRule } from './filter-rules';

const operators: Record<string, readonly string[]> = {
  type: ['is_any_of', 'is_not_any_of'],
  tag: ['is_any_of', 'is_not_any_of', 'includes_all', 'excludes_all'],
};

function parameter(field: string, operator: string): string {
  return operator === 'is_any_of' ? field : `${field}.${operator}`;
}

/** Repeated parameters keep multi-select values unambiguous, including commas. */
export function readCollectionFilters(params: URLSearchParams): (FilterRule & { id: string })[] {
  const rules = [];
  for (const [field, choices] of Object.entries(operators)) {
    for (const operator of choices) {
      const key = parameter(field, operator);
      const values = [...new Set(params.getAll(key).filter(Boolean))];
      if (values.length) rules.push({ id: `url-${key}`, field, operator, values });
    }
  }
  return rules;
}

/** Preserve unrelated query parameters and the document fragment. */
export function writeCollectionFilters(url: URL, rules: FilterRule[]): URL {
  for (const [field, choices] of Object.entries(operators)) {
    for (const operator of choices) url.searchParams.delete(parameter(field, operator));
  }
  for (const rule of coalesceFilterRules(retainMeaningfulRules(rules))) {
    if (!operators[rule.field]?.includes(rule.operator)) continue;
    for (const value of rule.values) url.searchParams.append(parameter(rule.field, rule.operator), value);
  }
  return url;
}

export function readCollectionView(params: URLSearchParams): { sort: 'asc' | 'desc'; page: number } {
  const rawPage = Number(params.get('page'));
  return {
    sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}
