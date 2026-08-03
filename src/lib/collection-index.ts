import type { Entry, EntryType } from './entries';
import { fmtDate } from './format';
import { plural as pluralize } from './text';
import { tagCounts } from './tags';
import { COLLECTIONS } from './collections.mjs';

export type { Topic } from './tags';

export interface FilterTab {
  id: string;
  label: string;
  count: number;
}

/** Plural tab labels, in the order the type filter lists them. */
const TAB_LABEL = Object.fromEntries(
  COLLECTIONS.map(collection => [collection.type, collection.plural]),
) as Record<EntryType, string>;

const TYPE_ORDER = COLLECTIONS.map(collection => collection.type);

/**
 * Type tabs for a list of entries: `all` first, then one tab per type that is
 * actually present. A single-type list (the per-collection index pages) gets
 * only `all`, which the filter bar reads as "no type field worth showing".
 */
export function buildFilterTabs(entries: Entry[]): FilterTab[] {
  const counts = new Map<EntryType, number>();
  for (const entry of entries) {
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  }
  const present = TYPE_ORDER.filter(type => (counts.get(type) ?? 0) > 0);
  const tabs: FilterTab[] = [{ id: 'all', label: 'all', count: entries.length }];
  if (present.length < 2) return tabs;
  return [
    ...tabs,
    ...present.map(type => ({
      id: type,
      label: TAB_LABEL[type],
      count: counts.get(type) ?? 0,
    })),
  ];
}

/** Tags across the entries, most-used first then alphabetical. */
export const buildTopics = tagCounts;

/**
 * Footer summary line, e.g. `12 entries · last edit Mar 4, 2026`. `noun` names
 * the unit so a per-collection page can say "notes" instead of "entries";
 * entries are assumed sorted newest-first, as `loadAllEntries` returns them.
 */
export function footerSummary(entries: Entry[], noun = 'entry', pluralNoun = 'entries'): string {
  const count = pluralize(entries.length, noun, pluralNoun);
  const updated = entries.reduce(
    (latest, entry) => (entry.updated > latest ? entry.updated : latest),
    '',
  );
  if (!updated) return count;
  return `${count} · last edit ${fmtDate(updated)}`;
}
