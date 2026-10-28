import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guideLoader } from '../guide-loader.mjs';

let vault;
afterEach(() => {
  if (vault) rmSync(vault, { recursive: true, force: true });
  vault = undefined;
});

function write(files) {
  vault ??= mkdtempSync(join(tmpdir(), 'teaman-guide-loader-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), content);
  }
  return vault;
}

/** The slice of Astro's loader context `vaultLoader` uses, with a live watcher. */
function createContext() {
  const entries = new Map();
  const handlers = { add: [], change: [], unlink: [] };
  return {
    entries,
    store: {
      keys: () => [...entries.keys()],
      get: id => entries.get(id),
      set: entry => entries.set(entry.id, entry),
      delete: id => entries.delete(id),
    },
    parseData: async ({ data }) => data,
    generateDigest: value => value,
    config: { root: pathToFileURL(`${vault}/`) },
    logger: { error: vi.fn() },
    watcher: { add: vi.fn(), on: (event, handler) => handlers[event].push(handler) },
    change: path => Promise.all(handlers.change.map(handler => handler(path))),
  };
}

describe('guideLoader', () => {
  it('stores each published guide’s index', async () => {
    write({
      'guides/g/SUMMARY.md': '---\ntags: [a]\n---\n# The Guide\n\n- [Intro](index.md)\n- [Next](next.md)\n',
      'guides/g/index.md': '# Intro',
      'guides/g/next.md': '---\ndraft: true\n---\n# Next',
      'guides/wip/SUMMARY.md': '---\ndraft: true\n---\n- [A](a.md)\n',
    });
    const context = createContext();
    await guideLoader({ vaultDir: vault }).load(context);
    expect([...context.entries.keys()]).toEqual(['g']);
    expect(context.entries.get('g').data).toEqual({
      title: 'The Guide',
      tags: ['a'],
      chapters: [{ slug: 'index', entryId: 'g', title: 'Intro' }],
    });
    expect(context.entries.get('g').filePath).toBe('guides/g/SUMMARY.md');
  });

  it('stores chapters in SUMMARY order, and no _-prefixed guide', async () => {
    write({
      'guides/alpha/SUMMARY.md': '# Alpha Guide\n- [Two](<Part Two.md>)\n- [One](one.md)\n',
      'guides/alpha/one.md': '# One',
      'guides/alpha/Part Two.md': '# Two',
      'guides/_tpl/SUMMARY.md': '- [A](a.md)\n',
      'guides/_tpl/a.md': '# A',
    });
    const context = createContext();
    await guideLoader({ vaultDir: vault }).load(context);
    expect([...context.entries.keys()]).toEqual(['alpha']);
    expect(context.entries.get('alpha').data.chapters).toEqual([
      { slug: 'part-two', entryId: 'alpha/part-two', title: 'Two' },
      { slug: 'one', entryId: 'alpha/one', title: 'One' },
    ]);
  });

  // What makes Astro's dev server re-run the guide routes' getStaticPaths.
  it('updates the store when a SUMMARY.md changes', async () => {
    write({ 'guides/g/SUMMARY.md': '# Before edit\n\n- [A](a.md)\n', 'guides/g/a.md': '# A' });
    const context = createContext();
    await guideLoader({ vaultDir: vault }).load(context);
    write({ 'guides/g/SUMMARY.md': '# After edit\n\n- [A](a.md)\n' });
    await context.change(join(vault, 'guides', 'g', 'SUMMARY.md'));
    expect(context.entries.get('g').data.title).toBe('After edit');
  });

  it('refuses a guide that cannot build', async () => {
    write({ 'guides/g/SUMMARY.md': '- [Gone](gone.md)\n' });
    await expect(guideLoader({ vaultDir: vault }).load(createContext()))
      .rejects.toThrow('guides: g/SUMMARY.md points at missing chapter gone.md');
  });
});
