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
import { fileURLToPath } from 'url';
import { join } from 'path';
import {
  compileReferenceDiagrams,
  referencePdfCacheKey,
  renderReferenceTypst,
} from '../src/lib/reference-pdf.mjs';
import { createReferenceCompiler } from '../src/lib/typst-packages.mjs';
import { discoverReferenceDocuments } from '../src/lib/reference-documents.mjs';
import { DEFAULT_BRAND } from '../src/lib/config-defaults.mjs';

const outDir = process.env.TEAMAN_OUT ?? fileURLToPath(new URL('../public', import.meta.url));
const vaultDir = process.env.TEAMAN_VAULT ?? fileURLToPath(new URL('../example', import.meta.url));
const referencesDir = join(vaultDir, 'references');
const diagramCacheDir = fileURLToPath(new URL('../.diagram-cache', import.meta.url));
const pdfCacheDir = fileURLToPath(new URL('../.reference-cache', import.meta.url));
const template = readFileSync(
  fileURLToPath(new URL('../resources/reference-template.typ', import.meta.url)),
  'utf8',
);
const config = (() => {
  try { return JSON.parse(process.env.TEAMAN_CONFIG ?? '{}'); }
  catch { return {}; }
})();

// Every edit to a reference strands its previous render, and these are whole
// PDFs rather than the kilobyte-sized SVGs in `.diagram-cache` — a few days of
// authoring would otherwise leave gigabytes behind. Entries are touched on use,
// so this only reclaims renders nothing has asked for in a fortnight.
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function pruneCache() {
  if (!existsSync(pdfCacheDir)) return;
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const name of readdirSync(pdfCacheDir)) {
    const file = join(pdfCacheDir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) rmSync(file, { force: true });
    } catch { /* raced with another build; the next run will get it */ }
  }
}

if (!existsSync(referencesDir)) {
  console.log('No reference documents to render.');
} else {
  const compiler = createReferenceCompiler(vaultDir);
  let count = 0;
  for (const document of discoverReferenceDocuments(referencesDir)) {
    if (document.error) throw new Error(document.error);
    if (document.data.draft === true) continue;
    if (document.missing.length > 0) {
      throw new Error(`${document.id}/SUMMARY.md lists missing chapters: ${document.missing.join(', ')}`);
    }
    if (document.invalid.length > 0) {
      throw new Error(`${document.id}/SUMMARY.md lists chapters outside its directory: ${document.invalid.join(', ')}`);
    }

    const diagrams = await compileReferenceDiagrams(document.body, { cacheDir: diagramCacheDir });
    const typst = renderReferenceTypst({
      template,
      title: document.title,
      summary: document.data.summary,
      date: document.data.date,
      tags: Array.isArray(document.data.tags) ? document.data.tags : [],
      brand: config.brand ?? DEFAULT_BRAND,
      body: document.body,
      chapters: document.kind === 'book' ? document.chapters : undefined,
      sourcePath: document.sourcePath,
      vaultDir,
      diagrams,
    });
    const targetDir = join(outDir, 'references', ...document.id.split('/'));
    mkdirSync(targetDir, { recursive: true });
    const target = join(targetDir, 'reference.pdf');
    const cached = join(pdfCacheDir, `${referencePdfCacheKey(typst, vaultDir)}.pdf`);
    if (existsSync(cached)) {
      copyFileSync(cached, target);
      utimesSync(cached, new Date(), new Date());
      console.log(`Reused cached reference PDF: ${document.id}`);
    } else {
      const pdf = compiler.pdf({ mainFileContent: typst });
      writeFileSync(target, pdf);
      mkdirSync(pdfCacheDir, { recursive: true });
      writeFileSync(cached, pdf);
      console.log(`Rendered reference PDF: ${document.id}`);
    }
    count++;
  }
  compiler.evictCache(0);
  pruneCache();
  console.log(`Prepared ${count} reference PDF${count === 1 ? '' : 's'}.`);
}
