import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTENT_DIRS } from '../../src/lib/collections.mjs';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { createConfluenceClient, planningClient } from '../confluence-client.mjs';
import { fakeConfluence } from './fake-confluence.mjs';
import { describeOperation, syncVault } from '../sync-confluence.mjs';

const baseUrl = 'https://wiki.example.com';

/** The fake instance, reached through the real client. */
function instance(options) {
  const fake = fakeConfluence(options);
  return { ...fake, client: createConfluenceClient({ baseUrl, pat: 'secret', timeoutMs: 1000, fetch: fake.fetch }) };
}

let vault;
const write = (path, content) => {
  mkdirSync(join(vault, path, '..'), { recursive: true });
  writeFileSync(join(vault, path), content);
};

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'teaman-sync-vault-'));
  write('notes/welcome.md', '# Welcome\n\n![photo](photo.png)\n');
  write('notes/photo.png', 'png bytes');
  write('notes/team/process.md', '---\ntitle: Our Process\n---\nSee [[welcome]].\n');
  write('notes/draft.md', '---\ndraft: true\n---\n# Draft\n');
});
afterEach(() => rmSync(vault, { recursive: true, force: true }));

const sync = (client, options = {}) => syncVault({
  catalog: openVaultCatalog(vault),
  client,
  folders: ['notes'],
  roots: { notes: '100' },
  warn: () => {},
  ...options,
});

describe('syncVault', () => {
  it('creates folder pages, pages, and attachments for what the site publishes', async () => {
    const confluence = instance();
    const operations = await sync(confluence.client);

    expect(operations.map(operation => operation.action)).toEqual([
      'create-folder', 'create-page', 'create-page', 'create-attachment',
    ]);
    const byTitle = title => [...confluence.pages.values()].find(page => page.title === title);
    expect(byTitle('Welcome').parent).toBe('100');
    expect(byTitle('Team').parent).toBe('100');
    expect(byTitle('Our Process').parent).toBe(byTitle('Team').id);
    expect(byTitle('Draft')).toBeUndefined();
    const process = byTitle('Our Process');
    expect(process.body).toContain('ri:content-title="Welcome"');
    expect([...confluence.attachments.values()].map(attachment => attachment.bytes)).toEqual(['png bytes']);
  });

  it('updates what is already there on a second run', async () => {
    const confluence = instance();
    await sync(confluence.client);
    confluence.writes.length = 0;
    const operations = await sync(confluence.client);

    expect(operations.map(operation => operation.action)).toEqual(['update-page', 'update-page', 'update-attachment']);
    expect(confluence.writes.map(([call]) => call)).toEqual(['updatePage', 'updatePage', 'updateAttachmentData']);
  });

  it('plans the same operations without writing, through the planning client', async () => {
    const confluence = instance();
    const planned = await sync(planningClient(confluence.client));

    expect(confluence.writes).toEqual([]);
    expect(planned.map(describeOperation)).toEqual([
      'create folder page "Team" under 100',
      'create page "Our Process" under dry:100/Team from notes/team/process.md',
      'create page "Welcome" under 100 from notes/welcome.md',
      'upload attachment "photo.png" (notes/photo.png) to dry:100/Welcome',
    ]);
  });

  it('warns about a missing image and syncs the page anyway', async () => {
    write('notes/welcome.md', '# Welcome\n\n![gone](gone.png)\n');
    const warnings = [];
    const operations = await sync(instance().client, { warn: message => warnings.push(message) });

    expect(warnings).toEqual(['Warning: image not found, skipping: notes/gone.png']);
    expect(operations.map(operation => operation.action)).toEqual(['create-folder', 'create-page', 'create-page']);
  });

  // Confluence addresses a page by its title, so two pages with one title
  // would land on one page: the second overwriting the first.
  it('tells apart pages the site titles alike, in pages and in links', async () => {
    write('guides/g/SUMMARY.md', '# G\n\n- [Overview](one.md)\n- [Overview](two.md)\n');
    write('guides/g/one.md', '# First\n\nOne body.\n');
    write('guides/g/two.md', '# Second\n\nTwo body. See [[two]].\n');
    write('notes/overview.md', '# overview\n');
    const confluence = instance({ roots: ['100', '200'] });
    await sync(confluence.client, { folders: ['guides', 'notes'], roots: { guides: '200', notes: '100' } });

    const pages = [...confluence.pages.values()];
    const byTitle = title => pages.filter(page => page.title === title);
    expect(byTitle('Overview (guides/g/one)')[0].body).toContain('One body.');
    expect(byTitle('Overview (guides/g/two)')[0].body).toContain('Two body.');
    expect(byTitle('Overview (guides/g/two)')[0].body).toContain('ri:content-title="Overview (guides/g/two)"');
    expect(byTitle('overview (notes/overview)')).toHaveLength(1);
    expect(byTitle('Overview')).toEqual([]);
  });

  it('tells apart folder pages the site titles alike, in pages and in links', async () => {
    write('guides/a/SUMMARY.md', '---\ntitle: Manual\n---\n\n- [Start A](start.md)\n');
    write('guides/a/start.md', 'A body.\n');
    write('guides/b/SUMMARY.md', '---\ntitle: Manual\n---\n\n- [Start B](start.md)\n');
    write('guides/b/start.md', 'B body. See [[a]].\n');
    const confluence = instance({ roots: ['200'] });
    await sync(confluence.client, { folders: ['guides'], roots: { guides: '200' } });

    const pages = [...confluence.pages.values()];
    const byTitle = title => pages.filter(page => page.title === title);
    const [folderA] = byTitle('Manual (guides/a)');
    const [folderB] = byTitle('Manual (guides/b)');
    expect(byTitle('Manual')).toEqual([]);
    expect(byTitle('Start A')[0].parent).toBe(folderA.id);
    expect(byTitle('Start B')[0].parent).toBe(folderB.id);
    expect(byTitle('Start B')[0].body).toContain('ri:content-title="Manual (guides/a)"');
  });

  it('refuses a root outside the configured space', async () => {
    await expect(sync(instance({ space: 'OTHER' }).client, { space: 'TEAM' }))
      .rejects.toThrow('Root 100 for notes is in space OTHER, not TEAM');
  });

  // A page beside a directory of another title keeps the folder page the
  // pages under it were synced into before nesting under a page existed.
  it('updates pages where an earlier sync put them, beside a page at their directory\'s path', async () => {
    write('notes/items.md', '# Overview\n');
    write('notes/items/modules.md', '# Modules\n');
    const confluence = instance();
    const folder = await confluence.client.createPage({ parentId: '100', spaceKey: 'TEAM', title: 'Items', body: '<p></p>' });
    await confluence.client.createPage({ parentId: '100', spaceKey: 'TEAM', title: 'Overview', body: '<p></p>' });
    const modules = await confluence.client.createPage({ parentId: folder.id, spaceKey: 'TEAM', title: 'Modules', body: '<p></p>' });

    const operations = await sync(confluence.client);
    expect(operations).toContainEqual({ action: 'update-page', title: 'Modules', page: modules.id, file: 'notes/items/modules.md' });
    expect(operations.filter(operation => operation.action.startsWith('create-page'))).toHaveLength(2);
  });

  it('plans what applying does when a directory nests under its page', async () => {
    write('notes/items.md', '# Items\n');
    write('notes/items/modules.md', '# Modules\n');
    const shape = operations => operations.map(({ action, title, filename }) => `${action} ${title ?? filename}`);

    const planned = await sync(planningClient(instance().client));
    const applied = await sync(instance().client);
    expect(shape(planned)).toEqual(shape(applied));
    expect(shape(applied).filter(line => line.endsWith(' Items'))).toEqual(['create-page Items']);
  });

  // Confluence takes a title once per space: a page of that title under any
  // other parent would refuse the create, so the sync refuses first, naming it.
  it('refuses a page whose title is taken elsewhere in the space, dry run included', async () => {
    const confluence = instance({ roots: ['100', '200'] });
    const taken = await confluence.client.createPage({ parentId: '200', spaceKey: 'TEAM', title: 'welcome', body: '<p/>' });
    const refusal = `Page "Welcome" (${taken.id}) already exists in space TEAM, but not under 100; move or rename it`;

    await expect(sync(planningClient(confluence.client))).rejects.toThrow(refusal);
    await expect(sync(confluence.client)).rejects.toThrow(refusal);
  });

  // The whole example vault, as an instance would take it: every page's
  // storage must parse, and a second run must find every page it made.
  it('syncs the example vault, then updates it in place', { timeout: 60_000 }, async () => {
    const example = fileURLToPath(new URL('../../example/', import.meta.url));
    const folders = CONTENT_DIRS.filter(folder => existsSync(join(example, folder)));
    const roots = Object.fromEntries(folders.map((folder, at) => [folder, String(100 + at)]));
    const confluence = instance({ roots: Object.values(roots) });
    const run = () => syncVault({ catalog: openVaultCatalog(example), client: confluence.client, folders, roots, warn: () => {} });

    const created = await run();
    expect(created.filter(operation => operation.action === 'create-page').length).toBeGreaterThan(10);
    expect(created.every(operation => operation.action.startsWith('create-'))).toBe(true);
    const updated = await run();
    expect(updated.every(operation => operation.action.startsWith('update-'))).toBe(true);
    expect(updated.length).toBe(created.filter(operation => operation.action !== 'create-folder').length);
  });
});

describe('createConfluenceClient', () => {
  function recordingFetch(respond) {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    };
    return { calls, fetch };
  }
  const json = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status });

  it('sends JSON with the auth header, and multipart past the XSRF check', async () => {
    const { calls, fetch } = recordingFetch(() => json(200, { results: [{ id: '9' }] }));
    const client = createConfluenceClient({ baseUrl: 'https://wiki', pat: 'secret', timeoutMs: 1000, fetch });

    await client.createPage({ parentId: 1, spaceKey: 'TEAM', title: 'T', body: '<p/>' });
    await client.createAttachment('5', Buffer.from('x'), 'a.png');

    expect(calls[0].url).toBe('https://wiki/rest/api/content');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ title: 'T', ancestors: [{ id: '1' }] });
    expect(calls[1].url).toBe('https://wiki/rest/api/content/5/child/attachment');
    expect(calls[1].init.body).toBeInstanceOf(FormData);
    expect(calls[1].init.headers).toMatchObject({ 'X-Atlassian-Token': 'no-check' });
    expect(calls[1].init.headers['Content-Type']).toBeUndefined();
  });

  it('finds a page by its title in the space, with its ancestors', async () => {
    const { calls, fetch } = recordingFetch(() => json(200, { results: [{ id: 'x', title: 'Wanted' }] }));
    const client = createConfluenceClient({ baseUrl: 'https://wiki', user: 'u', token: 't', timeoutMs: 1000, fetch });

    expect(await client.findPage('TEAM', 'Wanted & more')).toEqual({ id: 'x', title: 'Wanted' });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/rest/api/content');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: 'page', spaceKey: 'TEAM', title: 'Wanted & more', expand: 'version,space,ancestors',
    });
    expect(calls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from('u:t').toString('base64')}`);
  });

  it('reports a failed request with its status and message, and an empty answer as null', async () => {
    const { fetch } = recordingFetch((url, init) => (init.method === 'PUT'
      ? json(200)
      : json(403, { message: 'not allowed' })));
    const client = createConfluenceClient({ baseUrl: 'https://wiki', pat: 'p', timeoutMs: 1000, fetch });

    await expect(client.getPage('7')).rejects.toThrow('GET /rest/api/content/7?expand=version,space failed: 403 not allowed');
    expect(await client.updatePage({ page: { id: '7', version: { number: 1 } }, title: 'T', body: '' })).toBeNull();
  });
});
