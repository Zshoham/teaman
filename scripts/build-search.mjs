import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, basename } from 'path';
import matter from 'gray-matter';
import * as pagefind from 'pagefind';
import { parseDeck } from '../src/lib/parse-deck.mjs';
import { normalizeBase } from '../src/lib/site-base.mjs';
import { discoverDecks } from '../src/lib/discover-decks.mjs';

const publicDir = process.env.TEAMAN_OUT ?? fileURLToPath(new URL('../public', import.meta.url));
const vaultDir = process.env.TEAMAN_VAULT ?? fileURLToPath(new URL('../example', import.meta.url));
const slidesSrcDir = join(vaultDir, 'slides');
const decisionsSrcDir = join(vaultDir, 'decisions');
const siteBase = normalizeBase(process.env.TEAMAN_BASE ?? process.env.SITE_BASE);

const { index, errors: createErrors } = await pagefind.createIndex({
  forceLanguage: 'en',
});
if (createErrors.length) {
  console.error('pagefind.createIndex errors:', createErrors);
  process.exit(1);
}

// Index every built HTML page except the slidev SPAs (their bodies are empty
// until JS runs, so pagefind would only see a stub title). `slides/index.html`
// is the Astro-rendered deck index, not a deck, so it is listed explicitly.
const { errors: dirErrors, page_count } = await index.addDirectory({
  path: publicDir,
  glob: '{index.html,slides/index.html,{collections,daily,guides,notes}/**/*.html}',
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
    const { title, content } = parseDeck(deck.markdown);
    const { errors: recordErrors } = await index.addCustomRecord({
      url: `${siteBase}slides/${name}/`,
      content,
      language: 'en',
      meta: { title: title ?? name },
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
if (existsSync(decisionsSrcDir)) {
  const files = readdirSync(decisionsSrcDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const num = (basename(file, '.md').match(/(\d+)/) ?? [])[1] ?? basename(file, '.md');
    const { data, content } = matter(readFileSync(join(decisionsSrcDir, file), 'utf8'));
    const title = data.title ?? `ADR-${num}`;
    const body = [data.summary, content]
      .filter(Boolean)
      .join('\n')
      .replace(/^#+\s*/gm, '') // drop heading markers
      .replace(/^[-*+]\s+/gm, '') // drop bullet markers
      .trim();
    const { errors: recordErrors } = await index.addCustomRecord({
      url: `${siteBase}decisions/?adr=${num}`,
      content: `${title}\n${body}`,
      language: 'en',
      meta: { title: `ADR-${num} · ${title}` },
    });
    if (recordErrors.length) {
      console.error(`pagefind.addCustomRecord errors for ${file}:`, recordErrors);
      process.exit(1);
    }
    console.log(`Indexed decision: ${num}`);
  }
}

const { errors: writeErrors, outputPath } = await index.writeFiles({
  outputPath: join(publicDir, 'pagefind'),
});
if (writeErrors.length) {
  console.error('pagefind.writeFiles errors:', writeErrors);
  process.exit(1);
}
console.log(`Wrote pagefind bundle to ${outputPath}`);

await pagefind.close();
