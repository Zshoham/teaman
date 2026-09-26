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

describe('slidesLoader', () => {
  it('stores exactly the published decks, with catalog data and slide text', async () => {
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

    expect([...entries.keys()]).toEqual(['team-talk']);
    expect(entries.get('team-talk')).toMatchObject({
      data: { title: 'Talk', tags: [], slideCount: 2 },
      body: '# One\n\n# Two',
      filePath: 'Team Talk.md',
    });
  });
});
