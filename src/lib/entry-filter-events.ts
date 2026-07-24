export const ENTRY_FILTER_CHANGE_EVENT = 'teaman:entry-filter-change';
export const ENTRY_FILTER_TERM_EVENT = 'teaman:entry-filter-term';

export interface EntryFilterChangeDetail {
  matchedIds: string[] | null;
}

export interface EntryFilterTermDetail {
  field: 'tag';
  value: string;
}
