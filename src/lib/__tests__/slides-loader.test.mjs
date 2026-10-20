import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slidesLoader } from '../slides-loader.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function storeOf(entries) {
  return {
    store: {
      keys: () => [...entries.keys()],
      get: id => entries.get(id),
      set: entry => entries.set(entry.id, entry),
      delete: id => entries.delete(id),
    },
    parseData: async ({ data }) => data,
    generateDigest: value => String(value.length),
    config: { root: pathToFileURL(`${root}/`) },
  };
}

describe('slidesLoader', () => {
  // The store keeps one entry per id; a draft taking it would hide the deck.
  it('never lets a draft replace a published deck with the same id', async () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-slides-loader-'));
    writeFileSync(join(root, 'talk.md'), '---\ntitle: Published\n---\n# One\n');
    writeFileSync(join(root, 'talk-v2.md'), '---\nslug: talk\ndraft: true\ntitle: Draft\n---\n# One\n');
    const entries = new Map();
    await slidesLoader({ base: root }).load(storeOf(entries));
    expect([...entries.keys()]).toEqual(['talk']);
    expect(entries.get('talk').data.title).toBe('Published');
  });

  it('fails the load on a deck whose headmatter does not parse, as a glob would', async () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-slides-loader-'));
    writeFileSync(join(root, 'broken.md'), '---\ntitle: [unclosed\n---\n# One\n');
    await expect(slidesLoader({ base: root }).load(storeOf(new Map())))
      .rejects.toThrow(/slides\/broken\.md: frontmatter is not valid YAML/);
  });

  it('stores every deck outside _ paths, with catalog data and slide text', async () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-slides-loader-'));
    writeFileSync(join(root, 'Team Talk.md'), '---\ntitle: Talk\n---\n# One\n\n---\n\n# Two\n');
    writeFileSync(join(root, 'wip.md'), '---\ndraft: true\n---\n# WIP\n');
    writeFileSync(join(root, '_hidden.md'), '# Hidden\n');
    const entries = new Map();

    await slidesLoader({ base: root }).load({
      store: {
        keys: () => [...entries.keys()],
        get: id => entries.get(id),
        set: entry => entries.set(entry.id, entry),
        delete: id => entries.delete(id),
      },
      parseData: async ({ data }) => data,
      generateDigest: value => String(value.length),
      config: { root: pathToFileURL(`${root}/`) },
    });

    // The draft is stored; `getPublished` filters it, as for every collection.
    expect([...entries.keys()]).toEqual(['team-talk', 'wip']);
    expect(entries.get('team-talk')).toMatchObject({
      data: { title: 'Talk', tags: [], slideCount: 2 },
      body: '# One\n\n# Two',
      filePath: 'Team Talk.md',
    });
  });
});
