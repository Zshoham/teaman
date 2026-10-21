import { useEffect, useRef, useState } from 'react';
import { FilesIcon } from 'lucide-react';

import { CollectionFilterBar } from '@/components/CollectionFilterBar';
import { multiselectField, tagField } from '@/components/filter-fields';
import {
  createFilter,
  type Filter,
  type FilterFieldConfig,
} from '@/components/reui/filters';
import {
  coalesceFilterRules,
  matchesFilterRules,
  retainMeaningfulRules,
} from '@/lib/filter-rules';
import {
  ENTRY_FILTER_CHANGE_EVENT,
  ENTRY_FILTER_TERM_EVENT,
  ENTRY_FILTER_CLEAR_EVENT,
  ENTRY_FILTER_READY_EVENT,
  type EntryFilterChangeDetail,
  type EntryFilterTermDetail,
} from '@/lib/entry-filter-events';
import type { FilterTab, Topic } from '@/lib/collection-index';
import { readCollectionFilters, writeCollectionFilters } from '@/lib/collection-url';

interface FilterableEntry {
  id: string;
  type: string;
  tags: string[];
}

interface Props {
  filterTabs: FilterTab[];
  topics: Topic[];
  entries: FilterableEntry[];
  /** Unit named in the "N of M" readout — "notes" on a per-collection index. */
  resultLabel?: string;
  /**
   * Field to open as a chip on load. A per-collection index has only the Tag
   * field left, so hiding it behind an "add filter" menu of one entry is pure
   * friction — the chip is shown ready to pick from instead.
   */
  preselectField?: string;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toggleTerm(
  filters: Filter<string>[],
  field: string,
  value: string,
): Filter<string>[] {
  const normalized = coalesceFilterRules(filters);
  const index = normalized.findIndex(
    (filter) => filter.field === field && filter.operator === 'is_any_of',
  );
  if (index === -1) {
    return [...normalized, createFilter(field, 'is_any_of', [value])];
  }

  const current = normalized[index];
  const values = current.values.includes(value)
    ? current.values.filter((item) => item !== value)
    : [...current.values, value];
  if (values.length === 0) return normalized.filter((_, item) => item !== index);

  return normalized.map((filter, item) => (
    item === index ? { ...filter, values } : filter
  ));
}

/** Entry-list state adapter around the shared collection filter surface. */
export function EntryFilterBar({
  filterTabs,
  topics,
  entries,
  resultLabel = 'entries',
  preselectField,
}: Props) {
  'use memo';

  // An empty rule matches everything (see `matchesFilterRules`), so the chip
  // starts as a value picker rather than a filter. Fixed id: `createFilter`
  // randomises one, which would differ between SSR and hydration.
  const [filters, setFilters] = useState<Filter<string>[]>(() =>
    preselectField
      ? [{ id: `preselect-${preselectField}`, field: preselectField, operator: 'is_any_of', values: [] }]
      : [],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const restoreView = useRef(true);

  useEffect(() => {
    const restore = () => {
      const saved = readCollectionFilters(new URLSearchParams(location.search))
        .filter(rule => rule.field !== 'type' || filterTabs.length > 1);
      restoreView.current = true;
      setFilters(saved.length ? saved : preselectField
        ? [{ id: `preselect-${preselectField}`, field: preselectField, operator: 'is_any_of', values: [] }]
        : []);
      setReady(true);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [preselectField, filterTabs.length]);
  const fields = (() => {
    const next: FilterFieldConfig<string>[] = [];

    // A per-collection index is already scoped to one type, so `buildFilterTabs`
    // hands back only the `all` tab there and the Type field is dropped.
    const typeTabs = filterTabs.filter((tab) => tab.id !== 'all');
    if (typeTabs.length > 0) {
      next.push(multiselectField({
        key: 'type',
        label: 'Type',
        icon: <FilesIcon className="size-3.5" aria-hidden="true" />,
        options: typeTabs.map((tab) => ({
          value: tab.id,
          label: `${titleCase(tab.label)} (${tab.count})`,
        })),
      }));
    }

    if (topics.length > 0) next.push(tagField(topics));

    return next;
  })();

  const filteredEntries = entries.filter((entry) => matchesFilterRules(
    { type: [entry.type], tag: entry.tags },
    filters,
  ));

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    const url = writeCollectionFilters(new URL(location.href), filters);
    history.replaceState(history.state, '', url);
    const detail: EntryFilterChangeDetail = {
      matchedIds: filters.length > 0 ? filteredEntries.map((entry) => entry.id) : null,
      restoreView: restoreView.current,
    };
    restoreView.current = false;
    root.dispatchEvent(new CustomEvent(ENTRY_FILTER_CHANGE_EVENT, { detail }));
    // The island and Astro's list script may load in either order.
    const replay = () => root.dispatchEvent(new CustomEvent(ENTRY_FILTER_CHANGE_EVENT, {
      detail: { ...detail, restoreView: true },
    }));
    root.addEventListener(ENTRY_FILTER_READY_EVENT, replay);
    return () => root.removeEventListener(ENTRY_FILTER_READY_EVENT, replay);
  }, [filteredEntries, filters, ready]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handleTerm = (event: Event) => {
      const { field, value } = (event as CustomEvent<EntryFilterTermDetail>).detail;
      setFilters((current) => toggleTerm(current, field, value));
    };
    root.addEventListener(ENTRY_FILTER_TERM_EVENT, handleTerm);
    const clear = () => {
      setFilters(preselectField
        ? [{ id: `preselect-${preselectField}`, field: preselectField, operator: 'is_any_of', values: [] }]
        : []);
      root.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    };
    root.addEventListener(ENTRY_FILTER_CLEAR_EVENT, clear);
    return () => {
      root.removeEventListener(ENTRY_FILTER_TERM_EVENT, handleTerm);
      root.removeEventListener(ENTRY_FILTER_CLEAR_EVENT, clear);
    };
  }, [preselectField]);

  const handleChange = (next: Filter<string>[]) => {
    setFilters(retainMeaningfulRules(next, { keepField: preselectField }));
  };

  return (
    <div ref={rootRef} data-entry-filter-bar>
      <CollectionFilterBar
        className="-mx-px mb-1"
        filters={filters}
        fields={fields}
        onChange={handleChange}
        allowMultiple={!preselectField}
        resultCount={filteredEntries.length}
        totalCount={entries.length}
        resultLabel={resultLabel}
        actions={
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 border-b border-primary bg-transparent py-0.5 font-mono text-meta text-foreground hover:text-primary"
            data-sort-toggle
            aria-label="Sort: newest first"
          >
            date <span className="sort-arrow" aria-hidden="true">↓</span>
          </button>
        }
      />
    </div>
  );
}
