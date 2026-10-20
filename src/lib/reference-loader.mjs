import { bookProblems } from './books.mjs';
import { discoverReferenceDocuments } from './reference-documents.mjs';
import { vaultLoader } from './vault-loader.mjs';

/** Astro content loader that exposes one rendered entry per reference book. */
export function referenceLoader({ base }) {
  return vaultLoader({
    name: 'teaman-reference-loader',
    base,
    render: true,
    entries: () => discoverReferenceDocuments(base).map(document => {
      const problems = bookProblems(document);
      if (problems.length > 0) throw new Error(problems.join('; '));
      return { id: document.id, data: document.data, body: document.body, sourcePath: document.sourcePath };
    }),
  });
}
