import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import {
  compileReferenceDiagrams,
  referencePdfCacheKey,
  renderReferenceTypst,
} from '../src/lib/reference-pdf.mjs';
import { bookProblems } from '../src/lib/books.mjs';
import { entryHref } from '../src/lib/entry-identity.mjs';
import { openVaultCatalog } from '../src/lib/vault-catalog.mjs';
import { createVaultIndex } from '../src/lib/vault-index.mjs';

// Every edit to a reference strands its previous render, and these are whole
// PDFs rather than the kilobyte-sized SVGs in `.diagram-cache` — a few days of
// authoring would otherwise leave gigabytes behind. Entries are touched on use,
// so this only reclaims renders nothing has asked for in a fortnight.
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function pruneCache(pdfCacheDir) {
  if (!existsSync(pdfCacheDir)) return;
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const name of readdirSync(pdfCacheDir)) {
    const file = join(pdfCacheDir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) rmSync(file, { force: true });
    } catch { /* raced with another build; the next run will get it */ }
  }
}

/**
 * Render every published reference to `<outDir>/references/<id>/reference.pdf`,
 * reusing a cached PDF whenever the Typst source and the images it names are
 * unchanged. Throws on a reference the site would also refuse to build.
 *
 * @param {object} options
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} options.catalog
 * @param {string} options.outDir
 * @param {string} options.template  the Typst reference template
 * @param {string} [options.brand]
 * @param {string} options.diagramCacheDir
 * @param {string} options.pdfCacheDir
 * @param {() => { pdf(options: { mainFileContent: string }): Uint8Array, evictCache(age: number): void }} options.createCompiler
 *   called once, and only when a PDF has to be compiled
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{ rendered: string[], reused: string[] }>}  reference ids
 */
export async function buildReferences({
  catalog,
  outDir,
  template,
  brand,
  diagramCacheDir,
  pdfCacheDir,
  createCompiler,
  log = console.log,
}) {
  const { vaultDir } = catalog;
  const result = { rendered: [], reused: [] };
  const documents = catalog.all('reference');
  for (const document of documents) {
    const problems = bookProblems(document);
    if (problems.length > 0) throw new Error(problems.join('; '));
  }

  // The wiki-link index discovers every type (and parses every deck), so a
  // vault with nothing to compile does not build one; `teaman dev` runs this
  // stage on every start.
  const published = catalog.published('reference');
  if (published.length === 0) return result;

  const vaultIndex = createVaultIndex(vaultDir, { catalog });
  let compiler = null;
  for (const document of published) {
    const diagrams = await compileReferenceDiagrams(document.body, { cacheDir: diagramCacheDir });
    // A wiki-link the site resolves to a section of this reference becomes a
    // jump within the PDF; the vault index returns that section as an anchor
    // on this reference's own URL.
    const ownHref = entryHref('/', 'reference', document.id);
    const resolveWikiLink = (target, fromPath) => {
      const href = vaultIndex.resolve(target, fromPath)?.href ?? '';
      return href.startsWith(`${ownHref}#`) ? href.slice(ownHref.length + 1) : null;
    };
    const rendered = renderReferenceTypst({
      template,
      title: document.title,
      summary: document.data.summary,
      date: document.data.date,
      tags: Array.isArray(document.data.tags) ? document.data.tags : [],
      brand,
      body: document.body,
      chapters: document.kind === 'book' ? document.chapters : undefined,
      sourcePath: document.sourcePath,
      vaultDir,
      diagrams,
      resolveWikiLink,
      resolveAttachment: (target, fromPath) => vaultIndex.resolveAttachment(target, fromPath),
    });
    const targetDir = join(outDir, 'references', ...document.id.split('/'));
    mkdirSync(targetDir, { recursive: true });
    const target = join(targetDir, 'reference.pdf');
    const cached = join(pdfCacheDir, `${referencePdfCacheKey(rendered, vaultDir)}.pdf`);
    if (existsSync(cached)) {
      copyFileSync(cached, target);
      utimesSync(cached, new Date(), new Date());
      result.reused.push(document.id);
      log(`Reused cached reference PDF: ${document.id}`);
    } else {
      compiler ??= createCompiler();
      const pdf = compiler.pdf({ mainFileContent: rendered.typst });
      writeFileSync(target, pdf);
      mkdirSync(pdfCacheDir, { recursive: true });
      writeFileSync(cached, pdf);
      result.rendered.push(document.id);
      log(`Rendered reference PDF: ${document.id}`);
    }
  }
  compiler?.evictCache(0);
  pruneCache(pdfCacheDir);
  return result;
}

if (import.meta.main) {
  const { engineDir, outDir, siteConfig, vaultDir } = await import('../src/lib/build-env.mjs');
  const { createReferenceCompiler } = await import('../src/lib/typst-packages.mjs');
  try {
    const { rendered, reused } = await buildReferences({
      catalog: openVaultCatalog(vaultDir),
      outDir,
      template: readFileSync(join(engineDir, 'resources', 'reference-template.typ'), 'utf8'),
      brand: siteConfig.brand,
      diagramCacheDir: join(engineDir, '.diagram-cache'),
      pdfCacheDir: join(engineDir, '.reference-cache'),
      createCompiler: () => createReferenceCompiler(vaultDir),
    });
    const count = rendered.length + reused.length;
    console.log(count === 0
      ? 'No reference documents to render.'
      : `Prepared ${count} reference PDF${count === 1 ? '' : 's'}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
