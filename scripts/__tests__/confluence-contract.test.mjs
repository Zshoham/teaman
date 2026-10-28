import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createConfluenceClient } from '../confluence-client.mjs';
import { fakeConfluence, storageProblem } from './fake-confluence.mjs';
import { liveConfluence } from './live-confluence.mjs';

/*
 * What the sync relies on Confluence to do, checked through the client
 * against the in-memory fake on every run — and against a real instance when
 * the environment names one (`live-confluence.mjs`), which is what keeps the
 * fake honest. `bun run test:confluence-e2e` starts a throwaway instance and
 * runs this against it. Every page it makes sits under the scratch page,
 * titled by run, and is deleted afterwards.
 */

const live = liveConfluence();
const backends = [
  {
    name: 'fake',
    timeout: 5_000,
    open: () => ({ baseUrl: 'https://wiki.example.com', pat: 'secret', fetch: fakeConfluence({ roots: ['100'] }).fetch, root: '100' }),
  },
  ...(live ? [{ name: `live ${live.baseUrl}`, timeout: 30_000, open: () => ({ ...live, fetch: globalThis.fetch }) }] : []),
];

describe.each(backends)('Confluence ($name)', ({ open, timeout }) => {
  const instance = open();
  const client = createConfluenceClient({ ...instance, timeoutMs: timeout });
  const run = `teaman-contract-${Date.now().toString(36)}`;
  const made = [];
  let root;

  const page = async (title, { parent = root, body = '<p>contract</p>' } = {}) => {
    const created = await client.createPage({ parentId: parent.id, spaceKey: root.space.key, title: `${run} ${title}`, body });
    made.push(created.id);
    return created;
  };

  beforeAll(async () => {
    if (!instance.root) throw new Error('CONFLUENCE_CONTRACT_ROOT names no scratch page');
    root = await client.getPage(instance.root);
  }, timeout);

  // Children before their parents, so each delete leaves nothing orphaned.
  afterAll(async () => {
    const auth = instance.pat ? `Bearer ${instance.pat}` : `Basic ${Buffer.from(`${instance.user}:${instance.token}`).toString('base64')}`;
    for (const id of made.reverse()) {
      await instance.fetch(`${instance.baseUrl}/rest/api/content/${id}`, { method: 'DELETE', headers: { Authorization: auth } });
    }
  }, timeout * 4);

  it('finds a page by its title anywhere in the space, with its ancestors down to its parent', { timeout }, async () => {
    const parent = await page('parent');
    const child = await page('child', { parent });

    const found = await client.findPage(root.space.key, `${run} child`);
    expect(found).toMatchObject({ id: child.id, title: `${run} child`, space: { key: root.space.key }, version: { number: 1 } });
    expect(found.ancestors.at(-1).id).toBe(parent.id);
    expect(found.ancestors.at(-2).id).toBe(root.id);
    expect(await client.findPage(root.space.key, `${run} nothing`)).toBeNull();
  });

  it('finds a page by its title whatever its case', { timeout }, async () => {
    const created = await page('Mixed Case');
    expect((await client.findPage(root.space.key, `${run} mixed case`))?.id).toBe(created.id);
  });

  it('refuses a title taken anywhere in the space, whatever its case', { timeout }, async () => {
    const parent = await page('taken parent');
    await page('Taken');

    await expect(page('Taken', { parent })).rejects.toThrow(/ 400 /);
    await expect(page('TAKEN', { parent })).rejects.toThrow(/ 400 /);
  });

  it('updates a page only to the next version', { timeout }, async () => {
    const created = await page('versioned');
    const stale = { ...created, version: { number: created.version.number + 1 } };

    await expect(client.updatePage({ page: stale, title: created.title, body: '<p>stale</p>' })).rejects.toThrow(/ 409 /);
    const updated = await client.updatePage({ page: created, title: created.title, body: '<p>next</p>' });
    expect(updated.version.number).toBe(created.version.number + 1);
  });

  it('refuses storage that is not well-formed XHTML', { timeout }, async () => {
    const malformed = '<p>fish & chips</p>';
    expect(storageProblem(malformed)).not.toBeNull();
    await expect(page('malformed', { body: malformed })).rejects.toThrow(/ 400 /);
  });

  it('takes storage-format macros, links, and images', { timeout }, async () => {
    const storage = [
      '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>note</p></ac:rich-text-body></ac:structured-macro>',
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">js</ac:parameter>',
      '<ac:plain-text-body><![CDATA[a && b ]]]]><![CDATA[>]]></ac:plain-text-body></ac:structured-macro>',
      `<p><ac:link><ri:page ri:content-title="${run} parent" /><ac:plain-text-link-body><![CDATA[link]]></ac:plain-text-link-body></ac:link></p>`,
      '<p><ac:image ac:width="300"><ri:attachment ri:filename="photo.png" /></ac:image></p>',
      '<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task></ac:task-list>',
      '<p>a<br />b</p><hr />',
    ].join('');
    expect(storageProblem(storage)).toBeNull();
    expect((await page('storage', { body: storage })).id).toBeTruthy();
  });

  it('attaches a file once by its name, and replaces its data', { timeout }, async () => {
    const created = await page('attachments');
    const bytes = name => new TextEncoder().encode(name);

    const attachment = await client.createAttachment(created.id, bytes('first'), 'photo.png');
    expect(attachment).toMatchObject({ title: 'photo.png' });
    expect((await client.findAttachment(created.id, 'photo.png'))?.id).toBe(attachment.id);
    expect(await client.findAttachment(created.id, 'other.png')).toBeNull();
    await expect(client.createAttachment(created.id, bytes('again'), 'photo.png')).rejects.toThrow(/ 400 /);
    await client.updateAttachmentData(created.id, attachment.id, bytes('second'), 'photo.png');
  });

  it('answers a page that does not exist with a 404', { timeout }, async () => {
    await expect(client.getPage('999999999')).rejects.toThrow(/ 404 /);
  });
});
