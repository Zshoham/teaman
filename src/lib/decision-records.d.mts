export const ADR_STATUSES: readonly ['accepted', 'proposed', 'superseded'];
export type AdrStatus = (typeof ADR_STATUSES)[number];
export function adrDisplayTitle(num: string, title: string): string;
export function adrSearchText(record: { title: string; summary?: string; body: string }): string;
