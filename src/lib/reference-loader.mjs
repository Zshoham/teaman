import { relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { discoverReferenceDocuments } from './reference-documents.mjs';

const posix = value => value.replace(/\\/g, '/');

/** Astro content loader that exposes one rendered entry per reference book. */
export function referenceLoader({ base }) {
  // A sync reads the store's keys up front and writes them back at the end, so
  // two overlapping runs would let a slow earlier render clobber a newer one.
  let queue = Promise.resolve();

  return {
    name: 'teaman-reference-loader',
    async load(context) {
      const sync = async () => {
        const untouched = new Set(context.store.keys());
        for (const document of discoverReferenceDocuments(base)) {
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
          untouched.delete(document.id);
          const data = await context.parseData({
            id: document.id,
            data: document.data,
            filePath: document.sourcePath,
          });
          const digest = context.generateDigest(JSON.stringify({ data, body: document.body }));
          const existing = context.store.get(document.id);
          if (existing?.digest === digest) continue;
          const rendered = await context.renderMarkdown(document.body, {
            fileURL: pathToFileURL(document.sourcePath),
          });
          context.store.set({
            id: document.id,
            data,
            body: document.body,
            filePath: posix(relative(fileURLToPath(context.config.root), document.sourcePath)),
            digest,
            rendered,
            assetImports: rendered.metadata?.imagePaths,
          });
        }
        untouched.forEach(id => context.store.delete(id));
      };

      const run = () => {
        const next = queue.then(sync, sync);
        // Keep the chain alive whatever happens; callers observe `next`.
        queue = next.catch(() => {});
        return next;
      };

      await run();
      if (!context.watcher) return;
      // Astro scopes these listeners to this invocation of `load()` and removes
      // them before a full content resync, so each invocation must register its
      // own set rather than retaining loader-level watcher state.
      context.watcher.add(base);
      const reload = path => {
        if (!path.toLowerCase().endsWith('.md')) return Promise.resolve();
        // A half-written SUMMARY.md is normal while editing; report it and wait
        // for the next save rather than crashing the dev server.
        return run().catch(error => {
          context.logger.error(`reference reload failed: ${error.message}`);
        });
      };
      context.watcher.on('add', reload);
      context.watcher.on('change', reload);
      context.watcher.on('unlink', reload);
    },
  };
}
