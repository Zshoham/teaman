export const ENTRY_FILTER_CHANGE_EVENT = 'teaman:entry-filter-change';
export const ENTRY_FILTER_TERM_EVENT = 'teaman:entry-filter-term';
export const ENTRY_FILTER_CLEAR_EVENT = 'teaman:entry-filter-clear';
export const ENTRY_FILTER_READY_EVENT = 'teaman:entry-filter-ready';

export interface EntryFilterChangeDetail {
  matchedIds: string[] | null;
  restoreView?: boolean;
}

export interface EntryFilterTermDetail {
  field: 'tag';
  value: string;
}
