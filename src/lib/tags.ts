/**
 * Tag counting, shared by every tag-filterable surface (the collection indexes
 * and the ADR timeline). Pure and `astro:content`-free so the React islands can
 * import it.
 */

export interface Topic {
  tag: string;
  count: number;
}

/** Tag → count across any tagged records, most-used first then alphabetical. */
export function tagCounts(list: Array<{ tags: string[] }>): Topic[] {
  const counts = new Map<string, number>();
  for (const item of list) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}
