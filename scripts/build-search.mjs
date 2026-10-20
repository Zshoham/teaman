import { join } from 'path';
import * as pagefind from 'pagefind';
import { outDir, siteBase, vaultDir } from '../src/lib/build-env.mjs';
import { pagefindGlob } from '../src/lib/collections.mjs';
import { adrHref, entryHref } from '../src/lib/entry-identity.mjs';
import { adrDisplayTitle, adrSearchText } from '../src/lib/decision-records.mjs';
import { openVaultCatalog } from '../src/lib/vault-catalog.mjs';

const catalog = openVaultCatalog(vaultDir);

const { index, errors: createErrors } = await pagefind.createIndex({
  forceLanguage: 'en',
});
if (createErrors.length) {
  console.error('pagefind.createIndex errors:', createErrors);
  process.exit(1);
}

// Index every built HTML page whose content is actually in the HTML — the
// collection registry says which those are, and which types feed Pagefind
// custom records below instead (the Slidev SPAs and the decisions island).
const { errors: dirErrors, page_count } = await index.addDirectory({
  path: outDir,
  glob: pagefindGlob(),
});
if (dirErrors.length) {
  console.error('pagefind.addDirectory errors:', dirErrors);
  process.exit(1);
}
console.log(`Indexed ${page_count} HTML pages.`);

// Feed slidev decks in as custom records pointing at the deck URL.
for (const deck of catalog.published('slides')) {
  const name = deck.id;
  const { errors: recordErrors } = await index.addCustomRecord({
    url: entryHref(siteBase, 'slides', name),
    content: deck.text,
    language: 'en',
    meta: { title: deck.title },
  });
  if (recordErrors.length) {
    console.error(`pagefind.addCustomRecord errors for ${name}:`, recordErrors);
    process.exit(1);
  }
  console.log(`Indexed slide deck: ${name}`);
}

// The decisions page is a single client island whose ADR bodies only enter the
// DOM when a modal opens, so the built HTML can't be crawled per-ADR. Feed each
// ADR in as its own custom record that deep-links to its modal (?adr=<num>).
for (const record of catalog.published('decision')) {
  const title = String(record.data.title ?? `ADR-${record.num}`);
  const { errors: recordErrors } = await index.addCustomRecord({
    url: adrHref(siteBase, record.num),
    content: adrSearchText({ title, summary: record.data.summary, body: record.body }),
    language: 'en',
    meta: { title: adrDisplayTitle(record.num, title) },
  });
  if (recordErrors.length) {
    console.error(`pagefind.addCustomRecord errors for ${record.id}:`, recordErrors);
    process.exit(1);
  }
  console.log(`Indexed decision: ${record.num}`);
}

const { errors: writeErrors, outputPath } = await index.writeFiles({
  outputPath: join(outDir, 'pagefind'),
});
if (writeErrors.length) {
  console.error('pagefind.writeFiles errors:', writeErrors);
  process.exit(1);
}
console.log(`Wrote pagefind bundle to ${outputPath}`);

await pagefind.close();
