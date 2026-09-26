import { discoverReferenceDocuments } from './reference-documents.mjs';
import { vaultLoader } from './vault-loader.mjs';

/** Astro content loader that exposes one rendered entry per reference book. */
export function referenceLoader({ base }) {
  return vaultLoader({
    name: 'teaman-reference-loader',
    base,
    render: true,
    entries: () => discoverReferenceDocuments(base).map(document => {
      if (document.error) throw new Error(document.error);
      if (document.kind === 'book' && document.chapters.length === 0) {
        throw new Error(`${document.id}/SUMMARY.md lists no Markdown chapters`);
      }
      if (document.missing.length > 0) {
        throw new Error(`${document.id}/SUMMARY.md lists missing chapters: ${document.missing.join(', ')}`);
      }
      if (document.invalid.length > 0) {
        throw new Error(`${document.id}/SUMMARY.md lists chapters outside its directory: ${document.invalid.join(', ')}`);
      }
      return { id: document.id, data: document.data, body: document.body, sourcePath: document.sourcePath };
    }),
  });
}
