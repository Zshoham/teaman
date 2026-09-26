import { existsSync } from 'fs';
import { join, relative } from 'path';
import * as pagefind from 'pagefind';
import { discoverDecks } from '../src/lib/discover-decks.mjs';
import { outDir, siteBase, vaultDir } from '../src/lib/build-env.mjs';
import { pagefindGlob } from '../src/lib/collections.mjs';
import { adrHref, entryHref } from '../src/lib/entry-identity.mjs';
import { adrDisplayTitle, adrSearchText } from '../src/lib/decision-records.mjs';
import { discoverDecisions } from '../src/lib/discover-decisions.mjs';
import { isPublished } from '../src/lib/publication.mjs';

const slidesSrcDir = join(vaultDir, 'slides');
const decisionsSrcDir = join(vaultDir, 'decisions');

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
if (existsSync(slidesSrcDir)) {
  const decks = discoverDecks(slidesSrcDir);
  for (const deck of decks) {
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
}

// The decisions page is a single client island whose ADR bodies only enter the
// DOM when a modal opens, so the built HTML can't be crawled per-ADR. Feed each
// ADR in as its own custom record that deep-links to its modal (?adr=<num>).
for (const record of discoverDecisions(decisionsSrcDir)) {
  if (!isPublished({ data: record.data, relPath: relative(decisionsSrcDir, record.sourcePath) })) continue;
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
