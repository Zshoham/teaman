export const HOME_FILTER_CHANGE_EVENT = 'teaman:home-filter-change';
export const HOME_FILTER_TERM_EVENT = 'teaman:home-filter-term';

export interface HomeFilterChangeDetail {
  matchedIds: string[] | null;
}

export interface HomeFilterTermDetail {
  field: 'tag';
  value: string;
}
