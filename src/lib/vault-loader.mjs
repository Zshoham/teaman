import { relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const posix = value => value.replace(/\\/g, '/');

/**
 * An Astro content loader over entries the engine discovers itself, rather than
 * one-file-one-entry globbing: a reference book is many files, a deck is parsed
 * by Slidev's parser. Owns the store sync, digest-based skipping, and dev
 * watching; the caller supplies only the entries.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.base  directory to watch
 * @param {() => Array<{ id: string, data: object, body: string, sourcePath: string }>} options.entries
 *   The current entries. Throw to fail the load (the initial build fails; a
 *   dev reload logs and waits for the next save).
 * @param {boolean} [options.render]  render `body` as Markdown into the entry
 */
export function vaultLoader({ name, base, entries, render = false }) {
  // A sync reads the store's keys up front and writes them back at the end, so
  // two overlapping runs would let a slow earlier render clobber a newer one.
  let queue = Promise.resolve();

  return {
    name,
    async load(context) {
      const sync = async () => {
        const untouched = new Set(context.store.keys());
        for (const entry of entries()) {
          untouched.delete(entry.id);
          const data = await context.parseData({
            id: entry.id,
            data: entry.data,
            filePath: entry.sourcePath,
          });
          const digest = context.generateDigest(JSON.stringify({ data, body: entry.body }));
          const existing = context.store.get(entry.id);
          if (existing?.digest === digest) continue;
          const rendered = render
            ? await context.renderMarkdown(entry.body, { fileURL: pathToFileURL(entry.sourcePath) })
            : undefined;
          context.store.set({
            id: entry.id,
            data,
            body: entry.body,
            filePath: posix(relative(fileURLToPath(context.config.root), entry.sourcePath)),
            digest,
            ...(rendered ? { rendered, assetImports: rendered.metadata?.imagePaths } : {}),
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
        // A half-written file is normal while editing; report it and wait for
        // the next save rather than crashing the dev server.
        return run().catch(error => {
          context.logger.error(`${name} reload failed: ${error.message}`);
        });
      };
      context.watcher.on('add', reload);
      context.watcher.on('change', reload);
      context.watcher.on('unlink', reload);
    },
  };
}
