import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { buildSearch } from '../build-search.mjs';

let vault;
afterEach(() => {
  if (vault) rmSync(vault, { recursive: true, force: true });
  vault = undefined;
});

function write(path, content) {
  const full = join(vault, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** A Pagefind stand-in that records what it is fed. */
function fakePagefind({ failOn } = {}) {
  const calls = { directories: [], records: [], written: [] };
  const answer = step => ({ errors: step === failOn ? ['boom'] : [] });
  const index = {
    addDirectory: async options => (calls.directories.push(options), { ...answer('addDirectory'), page_count: 3 }),
    addCustomRecord: async record => (calls.records.push(record), answer('addCustomRecord')),
    writeFiles: async options => (calls.written.push(options), { ...answer('writeFiles'), outputPath: options.outputPath }),
  };
  return { calls, pagefind: { createIndex: async () => ({ index, errors: [] }) } };
}

describe('buildSearch', () => {
  it('feeds the built HTML and a record per published deck and ADR', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-search-'));
    write('slides/talk.md', '---\ntitle: The Talk\n---\n# Hello\n');
    write('slides/wip.md', '---\ndraft: true\n---\n# WIP\n');
    write('decisions/adr-0001.md', '---\ntitle: Use Bun\nsummary: Runtime\n---\nBecause.\n');
    write('decisions/adr-0002.md', '---\ntitle: Hidden\ndraft: true\n---\n');
    const { calls, pagefind } = fakePagefind();

    await buildSearch({ catalog: openVaultCatalog(vault), outDir: '/out', siteBase: '/site/', pagefind, log: () => {} });

    expect(calls.directories).toEqual([expect.objectContaining({ path: '/out' })]);
    expect(calls.records.map(record => [record.url, record.meta.title])).toEqual([
      ['/site/slides/talk/', 'The Talk'],
      ['/site/decisions/?adr=0001', expect.stringContaining('Use Bun')],
    ]);
    expect(calls.written).toEqual([{ outputPath: join('/out', 'pagefind') }]);
  });

  it('fails on a Pagefind error instead of writing a partial index', async () => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-search-'));
    write('slides/talk.md', '# Hello\n');
    const { calls, pagefind } = fakePagefind({ failOn: 'addCustomRecord' });

    await expect(buildSearch({ catalog: openVaultCatalog(vault), outDir: '/out', siteBase: '/', pagefind, log: () => {} }))
      .rejects.toThrow(/addCustomRecord for talk errors: boom/);
    expect(calls.written).toEqual([]);
  });
});
