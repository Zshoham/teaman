import type { CatalogRecord } from './vault-catalog.mjs';

export interface GuideIndex {
  title: string;
  tags: string[];
  chapters: Array<{ slug: string; entryId: string; title: string }>;
}

export function guideIndex(record: CatalogRecord): GuideIndex;
export function guideLoader(options: { vaultDir: string }): import('astro/loaders').Loader;
