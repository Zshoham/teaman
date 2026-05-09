import { readdirSync, existsSync, statSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join } from 'path';

const guidesSrcDir = fileURLToPath(new URL('../../content/guides', import.meta.url));
const publicDir = fileURLToPath(new URL('../../public/guides', import.meta.url));
const siteBase = process.env.SITE_BASE ?? '/';

if (!existsSync(guidesSrcDir)) {
  console.log('No guides directory, skipping.');
  process.exit(0);
}

const books = readdirSync(guidesSrcDir).filter(name => {
  const dir = join(guidesSrcDir, name);
  return statSync(dir).isDirectory() && existsSync(join(dir, 'book.toml'));
});

if (books.length === 0) {
  console.log('No mdBook books found.');
  process.exit(0);
}

for (const book of books) {
  const bookDir = join(guidesSrcDir, book);
  const outDir = join(publicDir, book);
  const bookBase = `${siteBase}guides/${book}/`;

  mkdirSync(outDir, { recursive: true });
  console.log(`Building book: ${book}`);
  execFileSync('mdbook', ['build', bookDir, '--dest-dir', outDir], {
    stdio: 'inherit',
    env: {
      ...process.env,
      MDBOOK_OUTPUT__HTML__SITE_URL: bookBase,
    },
  });
}
