import { useEffect, useMemo, useRef, useState } from 'react';
import { FilesIcon, TagsIcon } from 'lucide-react';

import { CollectionFilterBar } from '@/components/CollectionFilterBar';
import {
  createFilter,
  type Filter,
  type FilterFieldConfig,
} from '@/components/reui/filters';
import { coalesceFilterRules, matchesFilterRules } from '@/lib/filter-rules';
import {
  HOME_FILTER_CHANGE_EVENT,
  HOME_FILTER_TERM_EVENT,
  type HomeFilterChangeDetail,
  type HomeFilterTermDetail,
} from '@/lib/home-filter-events';

interface FilterTab {
  id: string;
  label: string;
  count: number;
}

interface Topic {
  tag: string;
  count: number;
}

interface FilterableEntry {
  id: string;
  type: string;
  tags: string[];
}

interface Props {
  filterTabs: FilterTab[];
  topics: Topic[];
  entries: FilterableEntry[];
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

/** Home-specific state adapter around the shared collection filter surface. */
export function HomeFilterBar({ filterTabs, topics, entries }: Props) {
  const [filters, setFilters] = useState<Filter<string>[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const fields = useMemo<FilterFieldConfig<string>[]>(() => {
    const next: FilterFieldConfig<string>[] = [
      {
        key: 'type',
        label: 'Type',
        icon: <FilesIcon className="size-3.5" aria-hidden="true" />,
        type: 'multiselect',
        searchable: true,
        defaultOperator: 'is_any_of',
        operators: [
          { value: 'is_any_of', label: 'is any of' },
          { value: 'is_not_any_of', label: 'is not any of' },
        ],
        options: filterTabs
          .filter((tab) => tab.id !== 'all')
          .map((tab) => ({
            value: tab.id,
            label: `${titleCase(tab.label)} (${tab.count})`,
          })),
      },
    ];

    if (topics.length > 0) {
      next.push({
        key: 'tag',
        label: 'Tag',
        icon: <TagsIcon className="size-3.5" aria-hidden="true" />,
        type: 'multiselect',
        searchable: true,
        defaultOperator: 'is_any_of',
        operators: [
          { value: 'is_any_of', label: 'is any of' },
          { value: 'is_not_any_of', label: 'is not any of' },
          { value: 'includes_all', label: 'includes all' },
          { value: 'excludes_all', label: 'excludes all' },
        ],
        options: topics.map(({ tag, count }) => ({
          value: tag,
          label: `#${tag} (${count})`,
        })),
      });
    }

    return next;
  }, [filterTabs, topics]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesFilterRules(
      { type: [entry.type], tag: entry.tags },
      filters,
    )),
    [entries, filters],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const detail: HomeFilterChangeDetail = {
      matchedIds: filters.length > 0 ? filteredEntries.map((entry) => entry.id) : null,
    };
    root.dispatchEvent(new CustomEvent(HOME_FILTER_CHANGE_EVENT, { detail }));
  }, [filteredEntries, filters.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handleTerm = (event: Event) => {
      const { field, value } = (event as CustomEvent<HomeFilterTermDetail>).detail;
      setFilters((current) => toggleTerm(current, field, value));
    };
    root.addEventListener(HOME_FILTER_TERM_EVENT, handleTerm);
    return () => root.removeEventListener(HOME_FILTER_TERM_EVENT, handleTerm);
  }, []);

  const handleChange = (next: Filter<string>[]) => {
    setFilters(next.filter(
      (filter) => filter.values.length > 0 ||
        filter.operator === 'empty' ||
        filter.operator === 'not_empty',
    ));
  };

  return (
    <div ref={rootRef} data-home-filter-bar>
      <CollectionFilterBar
        className="-mx-px mb-1"
        filters={filters}
        fields={fields}
        onChange={handleChange}
        resultCount={filteredEntries.length}
        totalCount={entries.length}
        resultLabel="entries"
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
