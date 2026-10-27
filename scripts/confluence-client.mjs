/**
 * The Confluence Server/Data Center REST calls the sync makes, and the two
 * adapters that answer them: `createConfluenceClient` talks to a real
 * instance; `planningClient` wraps one so reads still go through and writes
 * only pretend to — the dry run. `syncVault` (sync-confluence.mjs) is written
 * against this interface alone, so it runs the same either way, and a test
 * can hand it an in-memory one.
 *
 * @typedef {{ id: string, title: string, space: { key: string }, version: { number: number } }} ConfluencePage
 * @typedef {{ id: string, title: string }} ConfluenceAttachment
 *
 * @typedef {object} ConfluenceClient
 * @property {(id: string) => Promise<ConfluencePage>} getPage
 * @property {(parentId: string, title: string) => Promise<ConfluencePage | null>} findChild
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

    async findChild(parentId, title) {
      const limit = 200;
      for (let start = 0; ; ) {
        const data = await send(`${content(parentId)}/child/page?limit=${limit}&start=${start}&expand=version,space`);
        const match = data.results.find(page => page.title === title);
        if (match) return match;
        if (data.results.length < limit) return null;
        start += data.results.length;
      }
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
 * "creates" gets a `dry:` id that nothing on the instance has, so looking
 * under it finds nothing. What a sync would do is what `syncVault` reports.
 *
 * @param {ConfluenceClient} client
 * @returns {ConfluenceClient}
 */
export function planningClient(client) {
  const planned = id => String(id).startsWith('dry:');
  return {
    getPage: id => client.getPage(id),
    findChild: async (parentId, title) => (planned(parentId) ? null : client.findChild(parentId, title)),
    findAttachment: async (pageId, filename) => (planned(pageId) ? null : client.findAttachment(pageId, filename)),
    createAttachment: async () => null,
    updateAttachmentData: async () => null,
    createPage: async ({ parentId, spaceKey, title }) => (
      { id: `dry:${parentId}/${title}`, title, space: { key: spaceKey }, version: { number: 1 } }),
    updatePage: async ({ page, title }) => ({ ...page, title }),
  };
}
