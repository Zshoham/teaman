import { SaxesParser } from 'saxes';

/**
 * A Confluence Server/Data Center in memory, answering the REST calls
 * `createConfluenceClient` makes through the `fetch` it is handed, and
 * refusing a write the way an instance does: a page title taken in the space
 * (ignoring case), an update that does not bump the version by one, storage
 * that is not well-formed XHTML, a second attachment under one filename.
 * `confluence-contract.test.mjs` runs the same checks against this fake and,
 * when one is configured, a real instance, so the fake answers as Confluence
 * does rather than as the client expects it to.
 *
 * `pages` (id → { id, title, parent, space, version, body }), `attachments`
 * (`<page id>/<filename>` → { id, title, bytes }) and `writes` (one
 * `[client method, page id, title or filename]` per write that succeeded)
 * are there for tests to inspect.
 *
 * @param {object} [options]
 * @param {string} [options.space]
 * @param {string[]} [options.roots]  ids of pages that already exist, at the
 *   top of the space
 */
export function fakeConfluence({ space = 'TEAM', roots = ['100'] } = {}) {
  const pages = new Map(roots.map(id => [id, { id, title: `Root ${id}`, parent: null, space: { key: space }, version: { number: 1 }, body: '' }]));
  const attachments = new Map();
  const writes = [];
  let next = 1000;

  const ancestors = page => (page.parent ? [...ancestors(pages.get(page.parent)), { id: page.parent }] : []);
  const pageJson = page => ({
    id: page.id,
    type: 'page',
    title: page.title,
    space: page.space,
    version: page.version,
    ancestors: ancestors(page),
    body: { storage: { value: page.body, representation: 'storage' } },
  });
  const titled = (spaceKey, title) => [...pages.values()]
    .find(page => page.space.key === spaceKey && page.title.toLowerCase() === title.toLowerCase());
  const list = results => ({ results, start: 0, limit: 25, size: results.length });

  const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  const refuse = (status, message) => reply(status, { statusCode: status, message });

  // What a page write must hold to, whether it creates the page or updates it.
  function pageProblem({ title, body }, spaceKey, self) {
    if (!title?.trim()) return 'Page title cannot be empty';
    const taken = titled(spaceKey, title);
    if (taken && taken !== self) return `A page with this title already exists: A page already exists with the title ${title} in the space with key ${spaceKey}`;
    if (body?.storage?.representation !== 'storage') return 'Unsupported body representation';
    const problem = storageProblem(body.storage.value);
    if (problem) return `Error parsing xhtml: ${problem}`;
    return null;
  }

  async function handle(url, { method = 'GET', body } = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/rest\/api\/content/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const page = path[0] ? pages.get(path[0]) : null;
    if (path[0] && !page) return refuse(404, `No content found with id: ContentId{id=${path[0]}}`);

    if (method === 'GET' && path.length === 0) {
      const match = titled(searchParams.get('spaceKey'), searchParams.get('title') ?? '');
      return reply(200, list(match ? [pageJson(match)] : []));
    }
    if (method === 'GET' && path.length === 1) return reply(200, pageJson(page));

    if (method === 'POST' && path.length === 0) {
      const json = JSON.parse(body);
      const parent = pages.get(json.ancestors?.at(-1)?.id);
      if (json.type !== 'page') return refuse(400, 'Content type must be page');
      if (!parent) return refuse(400, 'Could not find the parent page');
      if (parent.space.key !== json.space?.key) return refuse(400, 'The parent page is in another space');
      const problem = pageProblem(json, parent.space.key, null);
      if (problem) return refuse(400, problem);
      const created = { id: String(next++), title: json.title, parent: parent.id, space: parent.space, version: { number: 1 }, body: json.body.storage.value };
      pages.set(created.id, created);
      writes.push(['createPage', parent.id, created.title]);
      return reply(200, pageJson(created));
    }

    if (method === 'PUT' && path.length === 1) {
      const json = JSON.parse(body);
      if (json.type !== 'page') return refuse(400, 'Content type must be page');
      if (json.version?.number !== page.version.number + 1) {
        return refuse(409, `Version must be incremented on update. Current version is: ${page.version.number}`);
      }
      const problem = pageProblem(json, page.space.key, page);
      if (problem) return refuse(400, problem);
      Object.assign(page, { title: json.title, version: { number: json.version.number }, body: json.body.storage.value });
      writes.push(['updatePage', page.id, page.title]);
      return reply(200, pageJson(page));
    }

    if (method === 'DELETE' && path.length === 1) {
      if ([...pages.values()].some(child => child.parent === page.id)) return refuse(400, 'Delete the page\'s children first');
      pages.delete(page.id);
      return reply(204);
    }

    if (path[1] === 'child' && path[2] === 'attachment') {
      if (method === 'GET' && path.length === 3) {
        const attachment = attachments.get(`${page.id}/${searchParams.get('filename')}`);
        return reply(200, list(attachment ? [attachment] : []));
      }
      const file = method === 'POST' && body instanceof FormData ? body.get('file') : null;
      if (!file) return refuse(400, 'No file in the multipart body');
      const bytes = await file.text();
      if (path.length === 3) {
        const key = `${page.id}/${file.name}`;
        if (attachments.has(key)) return refuse(400, `Cannot add a new attachment with same file name as an existing attachment: ${file.name}`);
        const attachment = { id: `att${next++}`, title: file.name, bytes };
        attachments.set(key, attachment);
        writes.push(['createAttachment', page.id, file.name]);
        return reply(200, list([attachment]));
      }
      if (path.length === 5 && path[4] === 'data') {
        const attachment = [...attachments.entries()].find(([key, { id }]) => key.startsWith(`${page.id}/`) && id === path[3])?.[1];
        if (!attachment) return refuse(404, `No attachment with id ${path[3]} on ${page.id}`);
        attachment.bytes = bytes;
        writes.push(['updateAttachmentData', page.id, attachment.title]);
        return reply(200, attachment);
      }
    }

    return refuse(404, `No route for ${method} ${pathname}`);
  }

  return { fetch: async (url, init) => handle(url, init), pages, attachments, writes };
}

// The namespaces Confluence's storage format declares for its macros and
// resource identifiers.
const STORAGE_NAMESPACES = {
  ac: 'http://atlassian.com/content',
  ri: 'http://atlassian.com/resource/identifier',
  at: 'http://atlassian.com/template',
};

/**
 * Why Confluence would refuse `xhtml` as a page's storage, or null: it must
 * parse as XML, with only the storage format's own namespace prefixes. Only
 * XML's own entities are known (`&amp;`, never `&nbsp;`) — stricter than an
 * instance may be, never looser.
 *
 * @param {string} xhtml
 * @returns {string | null}
 */
export function storageProblem(xhtml) {
  const parser = new SaxesParser({ xmlns: true, fragment: true, additionalNamespaces: STORAGE_NAMESPACES });
  let problem = null;
  parser.on('error', error => {
    problem ??= error.message;
  });
  parser.write(xhtml).close();
  return problem;
}
