import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { createConfluenceClient, planningClient } from '../confluence-client.mjs';
import { describeOperation, syncVault } from '../sync-confluence.mjs';

/** A Confluence instance in memory: pages under parents, attachments by page. */
function memoryConfluence({ space = 'TEAM', roots = ['100'] } = {}) {
  const pages = new Map(roots.map(id => [id, { id, title: `Root ${id}`, parent: null, space: { key: space }, version: { number: 1 }, body: '' }]));
  const attachments = new Map();
  let next = 1000;
  const writes = [];
  const client = {
    async getPage(id) {
      if (!pages.has(id)) throw new Error(`GET ${id} failed: 404`);
      return pages.get(id);
    },
    async findChild(parentId, title) {
      return [...pages.values()].find(page => page.parent === parentId && page.title === title) ?? null;
    },
    async findAttachment(pageId, filename) {
      return attachments.get(`${pageId}/${filename}`) ?? null;
    },
    async createAttachment(pageId, buffer, filename) {
      writes.push(['createAttachment', pageId, filename]);
      const attachment = { id: String(next++), title: filename, bytes: Buffer.from(buffer).toString() };
      attachments.set(`${pageId}/${filename}`, attachment);
      return attachment;
    },
    async updateAttachmentData(pageId, attachmentId, buffer, filename) {
      writes.push(['updateAttachmentData', pageId, filename]);
      attachments.get(`${pageId}/${filename}`).bytes = Buffer.from(buffer).toString();
      return null;
    },
    async createPage({ parentId, spaceKey, title, body }) {
      writes.push(['createPage', parentId, title]);
      const page = { id: String(next++), title, parent: parentId, space: { key: spaceKey }, version: { number: 1 }, body };
      pages.set(page.id, page);
      return page;
    },
    async updatePage({ page, title, body }) {
      writes.push(['updatePage', page.id, title]);
      Object.assign(pages.get(page.id), { title, body, version: { number: page.version.number + 1 } });
      return pages.get(page.id);
    },
  };
  return { client, pages, attachments, writes };
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
    const confluence = memoryConfluence();
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
    const confluence = memoryConfluence();
    await sync(confluence.client);
    confluence.writes.length = 0;
    const operations = await sync(confluence.client);

    expect(operations.map(operation => operation.action)).toEqual(['update-page', 'update-page', 'update-attachment']);
    expect(confluence.writes.map(([call]) => call)).toEqual(['updatePage', 'updatePage', 'updateAttachmentData']);
  });

  it('plans the same operations without writing, through the planning client', async () => {
    const confluence = memoryConfluence();
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
    const operations = await sync(memoryConfluence().client, { warn: message => warnings.push(message) });

    expect(warnings).toEqual(['Warning: image not found, skipping: notes/gone.png']);
    expect(operations.map(operation => operation.action)).toEqual(['create-folder', 'create-page', 'create-page']);
  });

  it('refuses a root outside the configured space', async () => {
    await expect(sync(memoryConfluence({ space: 'OTHER' }).client, { space: 'TEAM' }))
      .rejects.toThrow('Root 100 for notes is in space OTHER, not TEAM');
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

  it('pages through children to find one by title', async () => {
    const { calls, fetch } = recordingFetch(url => json(200, {
      results: url.includes('start=0')
        ? Array.from({ length: 200 }, (_, index) => ({ id: String(index), title: `p${index}` }))
        : [{ id: 'x', title: 'wanted' }],
    }));
    const client = createConfluenceClient({ baseUrl: 'https://wiki', user: 'u', token: 't', timeoutMs: 1000, fetch });

    expect(await client.findChild('1', 'wanted')).toEqual({ id: 'x', title: 'wanted' });
    expect(calls.map(call => new URL(call.url).searchParams.get('start'))).toEqual(['0', '200']);
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
