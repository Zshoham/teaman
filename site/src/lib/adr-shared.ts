/**
 * Pure utilities + shared types for the decisions (ADR) feature.
 *
 * This file deliberately avoids `astro:content` so it can be imported by the
 * client-side React island (`AdrTimeline`). Server-only loading lives next
 * door in `adr.ts`.
 */

export type AdrStatus = 'accepted' | 'proposed' | 'superseded';

/** Display labels for each status, in canonical render order. */
export const STATUS_LABEL: Record<AdrStatus, string> = {
  accepted: 'Accepted',
  proposed: 'Proposed',
  superseded: 'Superseded',
};

export const STATUS_ORDER: AdrStatus[] = ['accepted', 'proposed', 'superseded'];

/** Status → the global CSS custom property holding its (theme-reactive) colour. */
export const STATUS_VAR: Record<AdrStatus, string> = {
  accepted: '--st-accepted',
  proposed: '--st-proposed',
  superseded: '--st-superseded',
};

/** `var(--st-…)` for a status, for inline-style use. */
export function statusColor(s: AdrStatus): string {
  return `var(${STATUS_VAR[s]})`;
}

/**
 * Parses the ADR number out of a collection id. Files are named `adr-NNNN.md`,
 * so the id is `adr-0001`; we keep the zero-padded digits as the canonical num.
 * Falls back to the whole id if it carries no digits.
 */
export function adrNum(id: string): string {
  const m = id.match(/(\d+)/);
  return m ? m[1] : id;
}

// The view helpers below are structurally typed so they work on both the full
// `Adr` (server side) and the lighter `AdrView` the React island receives.

/** Index records by their number for lineage (supersedes / supersededBy) lookups. */
export function byNum<T extends { num: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((a) => [a.num, a]));
}

/** Groups records by calendar year, newest year first (items keep input order). */
export function groupByYear<T extends { date: string }>(
  list: T[],
): Array<{ year: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const a of list) {
    const y = a.date.slice(0, 4);
    const bucket = map.get(y);
    if (bucket) bucket.push(a);
    else map.set(y, [a]);
  }
  return [...map.keys()]
    .sort()
    .reverse()
    .map((year) => ({ year, items: map.get(year)! }));
}

/** Counts records per status (always includes every status, zero-filled). */
export function statusCounts(list: Array<{ status: AdrStatus }>): Record<AdrStatus, number> {
  const counts: Record<AdrStatus, number> = { accepted: 0, proposed: 0, superseded: 0 };
  for (const a of list) counts[a.status]++;
  return counts;
}

/** Tag → count, sorted by frequency then name. */
export function tagCounts(list: Array<{ tags: string[] }>): Array<{ tag: string; count: number }> {
  const m = new Map<string, number>();
  for (const a of list) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

/** Active filter selection for the timeline. */
export interface AdrFilter {
  statuses: Set<string>;
  tags: Set<string>;
}

/**
 * A record shows when its status is selected AND, if any tags are selected, it
 * carries at least one of them. Pure — shared by the component and its tests.
 */
export function adrMatches(card: { status: string; tags: string[] }, active: AdrFilter): boolean {
  if (!active.statuses.has(card.status)) return false;
  if (active.tags.size > 0 && !card.tags.some((t) => active.tags.has(t))) return false;
  return true;
}
