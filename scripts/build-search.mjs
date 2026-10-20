import { join } from 'path';
import { pagefindGlob } from '../src/lib/collections.mjs';
import { adrHref, entryHref } from '../src/lib/entry-identity.mjs';
import { adrDisplayTitle, adrSearchText } from '../src/lib/decision-records.mjs';
import { openVaultCatalog } from '../src/lib/vault-catalog.mjs';

function check(step, errors) {
  if (errors.length) throw new Error(`pagefind.${step} errors: ${errors.join('; ')}`);
}

/**
 * Build the Pagefind index for a built site in `outDir`: the crawlable HTML
 * plus a custom record for every published deck and ADR, whose content is not
 * in the HTML.
 *
 * @param {object} options
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} options.catalog
 * @param {string} options.outDir
 * @param {string} options.siteBase  normalized
 * @param {typeof import('pagefind')} options.pagefind
 * @param {(message: string) => void} [options.log]
 */
export async function buildSearch({ catalog, outDir, siteBase, pagefind, log = console.log }) {
  const { index, errors: createErrors } = await pagefind.createIndex({ forceLanguage: 'en' });
  check('createIndex', createErrors);

  // Index every built HTML page whose content is actually in the HTML — the
  // collection registry says which those are, and which types feed Pagefind
  // custom records below instead (the Slidev SPAs and the decisions island).
  const { errors: dirErrors, page_count } = await index.addDirectory({ path: outDir, glob: pagefindGlob() });
  check('addDirectory', dirErrors);
  log(`Indexed ${page_count} HTML pages.`);

  // Feed slidev decks in as custom records pointing at the deck URL.
  for (const deck of catalog.published('slides')) {
    const { errors } = await index.addCustomRecord({
      url: entryHref(siteBase, 'slides', deck.id),
      content: deck.text,
      language: 'en',
      meta: { title: deck.title },
    });
    check(`addCustomRecord for ${deck.id}`, errors);
    log(`Indexed slide deck: ${deck.id}`);
  }

  // The decisions page is a single client island whose ADR bodies only enter
  // the DOM when a modal opens, so the built HTML can't be crawled per-ADR.
  // Feed each ADR in as its own custom record that deep-links to its modal
  // (?adr=<num>).
  for (const record of catalog.published('decision')) {
    const title = String(record.data.title ?? `ADR-${record.num}`);
    const { errors } = await index.addCustomRecord({
      url: adrHref(siteBase, record.num),
      content: adrSearchText({ title, summary: record.data.summary, body: record.body }),
      language: 'en',
      meta: { title: adrDisplayTitle(record.num, title) },
    });
    check(`addCustomRecord for ${record.id}`, errors);
    log(`Indexed decision: ${record.num}`);
  }

  const { errors: writeErrors, outputPath } = await index.writeFiles({ outputPath: join(outDir, 'pagefind') });
  check('writeFiles', writeErrors);
  log(`Wrote pagefind bundle to ${outputPath}`);
}

if (import.meta.main) {
  const { outDir, siteBase, vaultDir } = await import('../src/lib/build-env.mjs');
  const pagefind = await import('pagefind');
  try {
    await buildSearch({ catalog: openVaultCatalog(vaultDir), outDir, siteBase, pagefind });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pagefind.close();
  }
}
