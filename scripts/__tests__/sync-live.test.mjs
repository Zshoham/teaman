import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_DIRS } from '../../src/lib/collections.mjs';
import { liveConfluence } from './live-confluence.mjs';

/*
 * `teaman sync-confluence --apply` of the example vault into a real instance,
 * through the CLI as a user runs it — when the environment names one
 * (`live-confluence.mjs`; `bun run test:confluence-e2e` starts a throwaway
 * instance). Confluence takes a title once per space, so the run makes a
 * space of its own and deletes it afterwards.
 */

const live = liveConfluence();
const engineDir = fileURLToPath(new URL('../../', import.meta.url));
const example = join(engineDir, 'example');
const timeout = 300_000;

// What Confluence renders in place of a macro or an image it cannot show.
const RENDER_FAILURES = /Unknown macro|Error rendering macro|Unable to render embedded object|could not be found/;

describe.skipIf(!live)('teaman sync-confluence against a live instance', () => {
  const space = `TM${Date.now().toString(36).toUpperCase()}`;
  const folders = CONTENT_DIRS.filter(folder => existsSync(join(example, folder)));
  const roots = {};

  const sync = () => {
    const result = spawnSync(process.execPath, [
      join(engineDir, 'bin/teaman.mjs'), 'sync-confluence', example,
      '--base-url', live.baseUrl,
      '--space', space,
      '--roots', Object.entries(roots).map(([folder, id]) => `${folder}=${id}`).join(','),
      '--apply',
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CONFLUENCE_PAT: live.pat ?? '',
        CONFLUENCE_USER: live.user ?? '',
        CONFLUENCE_TOKEN: live.token ?? '',
      },
    });
    if (result.status !== 0) throw new Error(`sync-confluence exited ${result.status}:\n${result.stderr}${result.stdout}`);
    const lines = result.stdout.split('\n').filter(line => /^(create|update|upload)/.test(line));
    const count = prefix => lines.filter(line => line.startsWith(prefix)).length;
    return { lines, count };
  };

  async function spacePages() {
    const pages = [];
    for (let start = 0; ; start += 50) {
      const cql = encodeURIComponent(`space = "${space}" and type = page`);
      const { results } = await live.rest(`/rest/api/content/search?cql=${cql}&limit=50&start=${start}&expand=body.view`);
      pages.push(...results);
      if (results.length < 50) return pages;
    }
  }

  beforeAll(async () => {
    const created = await live.rest('/rest/api/space', { method: 'POST', json: { key: space, name: `teaman sync ${space}` } });
    const home = created.homepage?.id ?? (await live.rest(`/rest/api/space/${space}?expand=homepage`)).homepage.id;
    for (const folder of folders) {
      const page = await live.rest('/rest/api/content', {
        method: 'POST',
        json: {
          type: 'page',
          title: `Vault ${folder}`,
          space: { key: space },
          ancestors: [{ id: home }],
          body: { storage: { value: '<p></p>', representation: 'storage' } },
        },
      });
      roots[folder] = page.id;
    }
  }, timeout);

  afterAll(async () => {
    await live.rest(`/rest/api/space/${space}`, { method: 'DELETE' });
  }, timeout);

  it('creates every page the site publishes, then updates each in place', { timeout }, async () => {
    const first = sync();
    expect(first.count('create page')).toBeGreaterThan(100);
    expect(first.count('upload attachment')).toBeGreaterThan(0);
    expect(first.lines.every(line => !line.startsWith('update'))).toBe(true);

    const second = sync();
    expect(second.count('create')).toBe(0);
    expect(second.count('upload')).toBe(0);
    expect(second.count('update page')).toBe(first.count('create page'));
    expect(second.count('update attachment')).toBe(first.count('upload attachment'));

    // The space's home page, a root per folder, and what the sync made: no
    // page made twice.
    const pages = await spacePages();
    expect(pages.length).toBe(1 + folders.length + first.count('create page') + first.count('create folder page'));
  });

  it('renders every page without a failed macro or image', { timeout }, async () => {
    const failures = (await spacePages())
      .filter(page => RENDER_FAILURES.test(page.body.view.value))
      .map(page => `${page.title}: ${page.body.view.value.match(RENDER_FAILURES)[0]}`);
    expect(failures).toEqual([]);
  });
});
