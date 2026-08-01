import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'url';

const discoverReferenceDocuments = vi.fn();
vi.mock('../reference-documents.mjs', () => ({ discoverReferenceDocuments }));

const { referenceLoader } = await import('../reference-loader.mjs');

const document = (id = 'book') => ({
  id,
  kind: 'book',
  data: { title: id },
  body: `# ${id}`,
  sourcePath: `/vault/references/${id}/SUMMARY.md`,
  chapters: [{ path: 'intro.md' }],
  missing: [],
  invalid: [],
});

function createContext() {
  const entries = new Map();
  const handlers = { add: [], change: [], unlink: [] };
  return {
    entries,
    handlers,
    store: {
      keys: () => [...entries.keys()],
      get: id => entries.get(id),
      set: entry => entries.set(entry.id, entry),
      delete: id => entries.delete(id),
    },
    parseData: async ({ data }) => data,
    generateDigest: value => `digest:${value.length}`,
    renderMarkdown: async body => ({ html: body }),
    config: { root: pathToFileURL('/vault/') },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    watcher: {
      add: vi.fn(),
      on: (event, handler) => handlers[event].push(handler),
    },
  };
}

const fire = context => Promise.all(
  context.handlers.change.map(handler => handler('/vault/references/book/SUMMARY.md')),
);

describe('referenceLoader', () => {
  beforeEach(() => {
    discoverReferenceDocuments.mockReset();
    discoverReferenceDocuments.mockReturnValue([document()]);
  });

  it('fails the initial load when a book is invalid', async () => {
    discoverReferenceDocuments.mockReturnValue([{ ...document(), missing: ['intro.md'] }]);
    const context = createContext();

    await expect(referenceLoader({ base: '/vault/references' }).load(context))
      .rejects.toThrow(/lists missing chapters/);
  });

  it('reports a failed reload instead of rejecting unobserved', async () => {
    const context = createContext();
    await referenceLoader({ base: '/vault/references' }).load(context);

    discoverReferenceDocuments.mockReturnValue([{ ...document(), chapters: [] }]);
    await fire(context);

    expect(context.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('lists no Markdown chapters'),
    );
  });

  it('recovers on the next save after a failed reload', async () => {
    const context = createContext();
    await referenceLoader({ base: '/vault/references' }).load(context);

    discoverReferenceDocuments.mockReturnValue([{ ...document(), chapters: [] }]);
    await fire(context);
    discoverReferenceDocuments.mockReturnValue([document('renamed')]);
    await fire(context);

    expect(context.store.keys()).toEqual(['renamed']);
  });

  it('re-registers watcher listeners after a full content resync', async () => {
    const context = createContext();
    const loader = referenceLoader({ base: '/vault/references' });
    await loader.load(context);

    for (const handlers of Object.values(context.handlers)) handlers.splice(0);
    await loader.load(context);

    expect(context.handlers.change).toHaveLength(1);
    expect(context.handlers.add).toHaveLength(1);
    expect(context.handlers.unlink).toHaveLength(1);
    expect(context.watcher.add).toHaveBeenCalledTimes(2);
  });

  it('serializes overlapping syncs', async () => {
    const context = createContext();
    let active = 0;
    let peak = 0;
    context.renderMarkdown = async body => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return { html: body };
    };
    await referenceLoader({ base: '/vault/references' }).load(context);

    discoverReferenceDocuments.mockReturnValue([document('one')]);
    const first = fire(context);
    discoverReferenceDocuments.mockReturnValue([document('two')]);
    await Promise.all([first, fire(context)]);

    expect(peak).toBe(1);
    expect(context.store.keys()).toEqual(['two']);
  });
});
