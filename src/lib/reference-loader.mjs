import { join } from 'path';
import { assertBuildable } from './build-problems.mjs';
import { collectionFor } from './collections.mjs';
import { openVaultCatalog } from './vault-catalog.mjs';
import { vaultLoader } from './vault-loader.mjs';

/**
 * Astro content loader that exposes one rendered entry per reference: the
 * vault catalog's references (`reference-documents.mjs`), drafts included,
 * which `getPublished` filters as it does a glob collection's.
 *
 * @param {{ vaultDir: string }} options
 */
export function referenceLoader({ vaultDir }) {
  return vaultLoader({
    name: 'teaman-reference-loader',
    base: join(vaultDir, collectionFor('reference').dir),
    render: true,
    entries: () => {
      // A fresh catalog per sync: in dev the loader re-runs on every save.
      const catalog = openVaultCatalog(vaultDir);
      assertBuildable(catalog, 'references');
      return catalog.all('reference').map(document => (
        { id: document.id, data: document.data, body: document.body, sourcePath: document.sourcePath }));
    },
  });
}
