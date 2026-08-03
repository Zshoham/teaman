/**
 * Field descriptors for the shared ReUI filter surface (`CollectionFilterBar`).
 *
 * Every filterable list on the site is a multiselect over a set of string
 * values, so the operator lists and the field boilerplate live here rather than
 * being spelled out per call site — the Tag field in particular is identical on
 * the collection indexes and the ADR timeline.
 */
import type { ReactNode } from 'react';
import { TagsIcon } from 'lucide-react';

import type { FilterFieldConfig, FilterOperator } from '@/components/reui/filters';
import type { Topic } from '@/lib/tags';

/**
 * For a field holding exactly one value per record (a type, a status): the
 * record either is or isn't one of the picked values.
 */
export const MEMBERSHIP_OPERATORS: FilterOperator[] = [
  { value: 'is_any_of', label: 'is any of' },
  { value: 'is_not_any_of', label: 'is not any of' },
];

/**
 * For a field holding a set per record (tags): "any of" and "all of" differ, so
 * the conjunctive operators are offered too.
 */
export const SET_OPERATORS: FilterOperator[] = [
  ...MEMBERSHIP_OPERATORS,
  { value: 'includes_all', label: 'includes all' },
  { value: 'excludes_all', label: 'excludes all' },
];

interface MultiselectFieldOptions {
  key: string;
  label: string;
  icon: ReactNode;
  options: FilterFieldConfig<string>['options'];
  /** Defaults to `MEMBERSHIP_OPERATORS`; tag-like fields pass `SET_OPERATORS`. */
  operators?: FilterOperator[];
}

/** A searchable multiselect field defaulting to "is any of". */
export function multiselectField({
  key,
  label,
  icon,
  options,
  operators = MEMBERSHIP_OPERATORS,
}: MultiselectFieldOptions): FilterFieldConfig<string> {
  return {
    key,
    label,
    icon,
    type: 'multiselect',
    searchable: true,
    defaultOperator: 'is_any_of',
    operators,
    options,
  };
}

/** The Tag field, identical wherever tags are filtered. */
export function tagField(topics: Topic[]): FilterFieldConfig<string> {
  return multiselectField({
    key: 'tag',
    label: 'Tag',
    icon: <TagsIcon className="size-3.5" aria-hidden="true" />,
    operators: SET_OPERATORS,
    options: topics.map(({ tag, count }) => ({ value: tag, label: `#${tag} (${count})` })),
  });
}
