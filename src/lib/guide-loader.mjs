import { join } from 'path';
import { assertBuildable } from './build-problems.mjs';
import { collectionFor } from './collections.mjs';
import { entryTitle } from './entry-title.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';
import { vaultLoader } from './vault-loader.mjs';

/**
 * A published guide of the vault catalog as the site lists it: its title
 * (`entry-title.mjs`), its SUMMARY.md tags, and its published chapters in
 * SUMMARY order, each by its URL segment and its `guides` collection id.
 *
 * @param {import('./vault-catalog.mjs').CatalogRecord} record
 */
export function guideIndex(record) {
  return {
    title: entryTitle({ data: record.data, body: record.body, id: record.id }),
    tags: Array.isArray(record.data.tags) ? record.data.tags : [],
    chapters: (record.chapters ?? [])
      .map(chapter => ({ slug: chapter.slug ?? chapter.id, entryId: chapter.id, title: chapter.title })),
  };
}

/**
 * Astro content loader for the guides' indexes: one entry per published guide
 * (`guideIndex`), its body the SUMMARY.md's. Kept in the content store so an
 * edit to a SUMMARY.md changes the store, and Astro's dev server re-runs the
 * guide routes' `getStaticPaths` — as an edit to a chapter (the `guides`
 * collection) does. Refuses a vault whose guides cannot build
 * (`build-problems.mjs`).
 *
 * @param {{ vaultDir: string }} options
 */
export function guideLoader({ vaultDir }) {
  return vaultLoader({
    name: 'teaman-guide-loader',
    base: join(vaultDir, collectionFor('guide').dir),
    entries: () => {
      // A fresh catalog per sync: in dev the loader re-runs on every save.
      const catalog = openVaultCatalog(vaultDir);
      assertBuildable(catalog, 'guides');
      return catalog.published('guide').map(record => (
        { id: record.id, data: guideIndex(record), body: record.body, sourcePath: record.sourcePath }));
    },
  });
}
