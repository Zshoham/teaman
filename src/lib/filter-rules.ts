/** Framework-neutral rule shape shared by the ReUI filter integrations. */
export interface FilterRule {
  field: string;
  operator: string;
  values: string[];
}

function valuesMatch(values: readonly string[], rule: FilterRule): boolean {
  if (rule.operator === 'empty') return values.length === 0;
  if (rule.operator === 'not_empty') return values.length > 0;
  if (rule.values.length === 0) return true;

  switch (rule.operator) {
    case 'is_not_any_of':
    case 'excludes_all':
      return rule.values.every((value) => !values.includes(value));
    case 'includes_all':
      return rule.values.every((value) => values.includes(value));
    case 'is_any_of':
    default:
      return rule.values.some((value) => values.includes(value));
  }
}

/** Applies ReUI-style rules to a record whose fields expose string values. */
export function matchesFilterRules(
  fields: Record<string, readonly string[]>,
  rules: FilterRule[],
): boolean {
  return rules.every((rule) => {
    const values = fields[rule.field];
    return values ? valuesMatch(values, rule) : true;
  });
}

/**
 * ReUI can add the same multiselect field more than once when it remains in the
 * Add Filter menu. Collapse equal field/operator pairs into one multi-value rule
 * so repeated selections retain the expected OR semantics and one compact chip.
 * Keep the newest rule identity because ReUI tracks the filter it just created
 * while its add-filter menu remains open.
 */
export function coalesceFilterRules<T extends FilterRule>(rules: T[]): T[] {
  const merged: T[] = [];
  const byKey = new Map<string, T>();

  for (const rule of rules) {
    const key = `${rule.field}\u0000${rule.operator}`;
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...rule, values: [...rule.values] };
      byKey.set(key, copy);
      merged.push(copy);
      continue;
    }
    const replacement = {
      ...rule,
      values: [...new Set([...existing.values, ...rule.values])],
    };
    const index = merged.indexOf(existing);
    merged[index] = replacement;
    byKey.set(key, replacement);
  }

  return merged;
}
