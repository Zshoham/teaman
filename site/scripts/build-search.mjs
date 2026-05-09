import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, basename } from 'path';
import * as pagefind from 'pagefind';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const slidesSrcDir = fileURLToPath(new URL('../../content/slides', import.meta.url));
const siteBase = process.env.SITE_BASE ?? '/';

function parseDeck(markdown) {
  let title = null;
  let body = markdown;

  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end !== -1) {
      const frontmatter = body.slice(4, end);
      body = body.slice(end + 5);
      const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '');
    }
  }

  // Drop slide separators (lines that are exactly `---`) so they don't
  // get treated as frontmatter or chunk markers by pagefind.
  body = body.replace(/^---\s*$/gm, '');

  return { title, content: body.trim() };
}

const { index, errors: createErrors } = await pagefind.createIndex({
  forceLanguage: 'en',
});
if (createErrors.length) {
  console.error('pagefind.createIndex errors:', createErrors);
  process.exit(1);
}

// Index every built HTML page except the slidev SPAs (their bodies are empty
// until JS runs, so pagefind would only see a stub title).
const { errors: dirErrors, page_count } = await index.addDirectory({
  path: publicDir,
  glob: '{index.html,{collections,guides,notes}/**/*.html}',
});
if (dirErrors.length) {
  console.error('pagefind.addDirectory errors:', dirErrors);
  process.exit(1);
}
console.log(`Indexed ${page_count} HTML pages.`);

// Feed slidev decks in as custom records pointing at the deck URL.
if (existsSync(slidesSrcDir)) {
  const decks = readdirSync(slidesSrcDir).filter(
    f => f.endsWith('.md') && !f.startsWith('_'),
  );
  for (const deck of decks) {
    const name = basename(deck, '.md');
    const markdown = readFileSync(join(slidesSrcDir, deck), 'utf8');
    const { title, content } = parseDeck(markdown);
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

const { errors: writeErrors, outputPath } = await index.writeFiles({
  outputPath: join(publicDir, 'pagefind'),
});
if (writeErrors.length) {
  console.error('pagefind.writeFiles errors:', writeErrors);
  process.exit(1);
}
console.log(`Wrote pagefind bundle to ${outputPath}`);

await pagefind.close();
