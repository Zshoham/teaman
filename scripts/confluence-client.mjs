/**
 * The Confluence Server/Data Center REST calls the sync makes, and the two
 * adapters that answer them: `createConfluenceClient` talks to a real
 * instance; `planningClient` wraps one so reads still go through and writes
 * only pretend to — the dry run. `syncVault` (sync-confluence.mjs) is written
 * against this interface alone, so it runs the same either way, and a test
 * can hand it an in-memory one.
 *
 * @typedef {{ id: string, title: string, space: { key: string }, version: { number: number }, ancestors?: Array<{ id: string }> }} ConfluencePage
 *   `ancestors` from the root of the space down to the page's parent
 * @typedef {{ id: string, title: string }} ConfluenceAttachment
 *
 * @typedef {object} ConfluenceClient
 * @property {(id: string) => Promise<ConfluencePage>} getPage
 * @property {(spaceKey: string, title: string) => Promise<ConfluencePage | null>} findPage
 *   the page with that title anywhere in the space (a title is taken once
 *   per space), with its ancestors
 * @property {(pageId: string, filename: string) => Promise<ConfluenceAttachment | null>} findAttachment
 * @property {(pageId: string, buffer: Uint8Array, filename: string) => Promise<unknown>} createAttachment
 * @property {(pageId: string, attachmentId: string, buffer: Uint8Array, filename: string) => Promise<unknown>} updateAttachmentData
 * @property {(page: { parentId: string, spaceKey: string, title: string, body: string }) => Promise<ConfluencePage | null>} createPage
 *   null when the instance answers a write with an empty body
 * @property {(update: { page: ConfluencePage, title: string, body: string }) => Promise<ConfluencePage | null>} updatePage
 */

/**
 * @param {object} options
 * @param {string} options.baseUrl  without a trailing slash
 * @param {string} [options.user]
 * @param {string} [options.token]
 * @param {string} [options.pat]  a bearer personal access token, used instead
 *   of `user`/`token`
 * @param {number} options.timeoutMs  per request
 * @param {typeof fetch} [options.fetch]
 * @returns {ConfluenceClient}
 */
export function createConfluenceClient({ baseUrl, user, token, pat, timeoutMs, fetch = globalThis.fetch }) {
  const auth = pat ? `Bearer ${pat}` : `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;

  /**
   * One REST call. A `json` body is sent as JSON; a `form` body as
   * multipart/form-data, which Confluence's attachment endpoints take, with
   * the X-Atlassian-Token header that lets a non-JSON write past its XSRF
   * check. Resolves to the parsed response, or null for an empty one.
   */
  async function send(path, { method = 'GET', json, form } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
        signal: controller.signal,
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          ...(form ? { 'X-Atlassian-Token': 'no-check' } : { 'Content-Type': 'application/json' }),
        },
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`${method} ${path} timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (response.ok) throw new Error(`${method} ${path} returned invalid JSON`);
      }
    }
    if (!response.ok) {
      const message = data?.message ?? data?.statusMessage ?? text;
      throw new Error(`${method} ${path} failed: ${response.status} ${message}`);
    }
    return data;
  }

  const content = id => `/rest/api/content/${encodeURIComponent(id)}`;
  const fileForm = (buffer, filename) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    return form;
  };

  return {
    getPage: id => send(`${content(id)}?expand=version,space`),

    async findPage(spaceKey, title) {
      const query = new URLSearchParams({ type: 'page', spaceKey, title, expand: 'version,space,ancestors' });
      const data = await send(`/rest/api/content?${query}`);
      return data.results[0] ?? null;
    },

    async findAttachment(pageId, filename) {
      const data = await send(`${content(pageId)}/child/attachment?filename=${encodeURIComponent(filename)}`);
      return data.results[0] ?? null;
    },

    async createAttachment(pageId, buffer, filename) {
      const data = await send(`${content(pageId)}/child/attachment`, { method: 'POST', form: fileForm(buffer, filename) });
      return data.results[0];
    },

    updateAttachmentData: (pageId, attachmentId, buffer, filename) => send(
      `${content(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/data`,
      { method: 'POST', form: fileForm(buffer, filename) },
    ),

    createPage: ({ parentId, spaceKey, title, body }) => send('/rest/api/content', {
      method: 'POST',
      json: {
        type: 'page',
        title,
        space: { key: spaceKey },
        ancestors: [{ id: String(parentId) }],
        body: { storage: { value: body, representation: 'storage' } },
      },
    }),

    updatePage: ({ page, title, body }) => send(content(page.id), {
      method: 'PUT',
      json: {
        id: page.id,
        type: 'page',
        title,
        version: { number: page.version.number + 1 },
        body: { storage: { value: body, representation: 'storage' } },
      },
    }),
  };
}

/**
 * A client that reads through `client` and writes nothing: a page it
 * "creates" gets a `dry:` id that nothing on the instance has, and is found
 * by its title from then on, as the created page would be — so a plan makes
 * each page once, as the sync it previews does. What a sync would do is what
 * `syncVault` reports.
 *
 * @param {ConfluenceClient} client
 * @returns {ConfluenceClient}
 */
export function planningClient(client) {
  const isPlanned = id => String(id).startsWith('dry:');
  /** @type {Map<string, ConfluencePage>} by space and title, ignoring case */
  const plannedByTitle = new Map();
  /** @type {Map<string, ConfluencePage>} */
  const plannedById = new Map();
  const titleKey = (spaceKey, title) => `${spaceKey}\n${title.toLowerCase()}`;
  return {
    getPage: id => client.getPage(id),
    findPage: async (spaceKey, title) => plannedByTitle.get(titleKey(spaceKey, title)) ?? client.findPage(spaceKey, title),
    findAttachment: async (pageId, filename) => (isPlanned(pageId) ? null : client.findAttachment(pageId, filename)),
    createAttachment: async () => null,
    updateAttachmentData: async () => null,
    createPage: async ({ parentId, spaceKey, title }) => {
      // Under a planned parent, its planned ancestors; under one on the
      // instance, just the parent, which is all a lookup compares.
      const ancestors = [...(plannedById.get(String(parentId))?.ancestors ?? []), { id: String(parentId) }];
      const page = { id: `dry:${parentId}/${title}`, title, space: { key: spaceKey }, version: { number: 1 }, ancestors };
      plannedByTitle.set(titleKey(spaceKey, title), page);
      plannedById.set(page.id, page);
      return page;
    },
    updatePage: async ({ page, title }) => ({ ...page, title }),
  };
}
