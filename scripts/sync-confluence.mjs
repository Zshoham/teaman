import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
import { parseArgs as parseCliArgs } from 'util';
import { fileURLToPath } from 'url';

import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const engineDir = fileURLToPath(new URL('..', import.meta.url));
const defaultContentDir = join(engineDir, 'example');

// Optional static defaults. Prefer passing --roots or CONFLUENCE_ROOTS so this
// repository does not have to carry deployment-specific page ids.
const STATIC_ROOTS = {
  // guides: '123456',
  // notes: '234567',
  // slides: '345678',
  // dailies: '456789',
};

function usage() {
  console.log(`Sync repository markdown content to Confluence Server/Data Center.

Required:
  --base-url URL          Confluence base URL, e.g. https://wiki.example.com
  --user USER             Confluence username or email (or CONFLUENCE_USER)
  --token TOKEN           Confluence password/API token (or CONFLUENCE_TOKEN)
                         Use --pat/CONFLUENCE_PAT for bearer personal access tokens.
  --roots MAP            Folder-to-root ids, e.g. guides=123,notes=456
                         May also be JSON via CONFLUENCE_ROOTS='{"guides":"123"}'

Options:
  --content-dir PATH      Content directory (default: ./example)
  --space KEY             Space key for newly created pages if roots are not enough
  --apply                 Write changes. Without this, prints a dry-run plan.
  --only FOLDERS          Comma-separated content folders to sync.
  --timeout-ms MS        Per-request timeout (default: 30000; CONFLUENCE_TIMEOUT_MS)
  --help                  Show this help.

Examples:
  node scripts/sync-confluence.mjs --base-url https://wiki.local --user alice \\
    --token "$CONFLUENCE_TOKEN" --roots guides=111,notes=222 --apply

  CONFLUENCE_BASE_URL=https://wiki.local CONFLUENCE_PAT=secret \\
  CONFLUENCE_ROOTS='{"guides":"111"}' npm run sync:confluence -- --apply
`);
}

function parseArgs(argv) {
  const { values } = parseCliArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      apply: { type: 'boolean' },
      'base-url': { type: 'string' },
      user: { type: 'string' },
      token: { type: 'string' },
      pat: { type: 'string' },
      roots: { type: 'string', multiple: true },
      'content-dir': { type: 'string' },
      only: { type: 'string' },
      space: { type: 'string' },
      'timeout-ms': { type: 'string' },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    process.exit(0);
  }

  let roots = parseRoots(process.env.CONFLUENCE_ROOTS);
  for (const value of values.roots ?? []) {
    roots = { ...roots, ...parseRoots(value) };
  }

  const args = {
    baseUrl: values['base-url'] ?? process.env.CONFLUENCE_BASE_URL,
    user: values.user ?? process.env.CONFLUENCE_USER,
    token: values.token ?? process.env.CONFLUENCE_TOKEN,
    pat: values.pat ?? process.env.CONFLUENCE_PAT,
    roots: { ...STATIC_ROOTS, ...roots },
    contentDir: values['content-dir'] ?? defaultContentDir,
    apply: values.apply ?? false,
    only: values.only ? new Set(values.only.split(',').map(s => s.trim()).filter(Boolean)) : null,
    space: values.space ?? process.env.CONFLUENCE_SPACE,
    timeoutMs: parseTimeout(values['timeout-ms'] ?? process.env.CONFLUENCE_TIMEOUT_MS),
  };

  args.baseUrl = args.baseUrl?.replace(/\/+$/, '');
  return args;
}

function parseTimeout(value) {
  if (!value) return 30000;
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error(`Invalid timeout: ${value}`);
  return timeoutMs;
}

function parseRoots(value) {
  if (!value) return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  const roots = {};
  for (const pair of trimmed.split(',')) {
    const [folder, pageId] = pair.split('=').map(s => s.trim());
    if (!folder || !pageId) throw new Error(`Invalid --roots entry: ${pair}`);
    roots[folder] = pageId;
  }
  return roots;
}

function assertConfig(args) {
  const missing = [];
  if (!args.baseUrl) missing.push('--base-url or CONFLUENCE_BASE_URL');
  if (!args.pat && !args.user) missing.push('--user or CONFLUENCE_USER');
  if (!args.pat && !args.token) missing.push('--token, --pat, CONFLUENCE_TOKEN, or CONFLUENCE_PAT');
  if (Object.keys(args.roots).length === 0) missing.push('--roots or CONFLUENCE_ROOTS');
  if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
}

function listFolders(contentDir, roots, only) {
  return readdirSync(contentDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => roots[name])
    .filter(name => !only || only.has(name))
    .sort();
}

function walkMarkdown(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

function pageTitle(markdown, filePath) {
  const parsed = matter(markdown);
  const title = frontmatterTitle(parsed.data) ?? firstHeading(parsed.content);
  return title ?? segmentTitle(basename(filePath, '.md'));
}

function frontmatterTitle(data) {
  return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
}

function firstHeading(markdown) {
  const tokens = markdownRenderer.parse(markdown, {});
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
      const inline = tokens[i + 1];
      return inline?.type === 'inline' && inline.content.trim() ? inline.content.trim() : null;
    }
  }
  return null;
}

function storageBody(markdown, title) {
  const parsed = matter(markdown);
  return markdownToStorage(stripMatchingLeadingH1(parsed.content, title));
}

function codeMacro(lines) {
  return `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${escapeCdata(lines.join('\n'))}]]></ac:plain-text-body></ac:structured-macro>`;
}

function escapeCdata(value) {
  return value.replaceAll(']]>', ']]]]><![CDATA[>');
}

const markdownRenderer = new MarkdownIt({
  html: false,
  xhtmlOut: true,
  linkify: true,
});

markdownRenderer.renderer.rules.fence = renderCodeToken;
markdownRenderer.renderer.rules.code_block = renderCodeToken;
markdownRenderer.renderer.rules.thead_open = () => '<tbody>\n';
markdownRenderer.renderer.rules.thead_close = () => '';
markdownRenderer.renderer.rules.tbody_open = () => '';
markdownRenderer.renderer.rules.tbody_close = () => '</tbody>\n';

function renderCodeToken(tokens, idx) {
  return `${codeMacro(tokens[idx].content.replace(/\n$/, '').split('\n'))}\n`;
}

function markdownToStorage(markdown) {
  return markdownRenderer.render(markdown).trimEnd();
}

function stripMatchingLeadingH1(markdown, title) {
  const tokens = markdownRenderer.parse(markdown, {});
  const firstBlock = tokens.findIndex(token => !token.hidden);
  const heading = tokens[firstBlock];
  const inline = tokens[firstBlock + 1];
  if (
    heading?.type !== 'heading_open'
    || heading.tag !== 'h1'
    || inline?.type !== 'inline'
    || inline.content.trim() !== title
    || !heading.map
  ) {
    return markdown;
  }

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  lines.splice(heading.map[0], heading.map[1] - heading.map[0]);
  return lines.join('\n');
}

class ConfluenceClient {
  constructor({ baseUrl, user, token, pat, timeoutMs }) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.auth = pat ? `Bearer ${pat}` : `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`${options.method ?? 'GET'} ${path} timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        if (response.ok) throw new Error(`${options.method ?? 'GET'} ${path} returned invalid JSON`);
      }
    }
    if (!response.ok) {
      const message = data?.message ?? data?.statusMessage ?? text;
      throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${message}`);
    }
    return data;
  }

  getPage(id) {
    return this.request(`/rest/api/content/${encodeURIComponent(id)}?expand=version,space`);
  }

  async findChild(parentId, title) {
    let start = 0;
    const limit = 200;

    while (true) {
      const data = await this.request(`/rest/api/content/${encodeURIComponent(parentId)}/child/page?limit=${limit}&start=${start}&expand=version,space`);
      const match = data.results.find(page => page.title === title);
      if (match) return match;
      if (data.results.length < limit) return null;
      start += data.results.length;
    }
  }

  createPage({ parentId, spaceKey, title, body }) {
    return this.request('/rest/api/content', {
      method: 'POST',
      body: JSON.stringify({
        type: 'page',
        title,
        space: { key: spaceKey },
        ancestors: [{ id: String(parentId) }],
        body: { storage: { value: body, representation: 'storage' } },
      }),
    });
  }

  updatePage({ page, title, body }) {
    return this.request(`/rest/api/content/${encodeURIComponent(page.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: page.id,
        type: 'page',
        title,
        version: { number: page.version.number + 1 },
        body: { storage: { value: body, representation: 'storage' } },
      }),
    });
  }
}

function isDryPage(page) {
  return String(page.id).startsWith('dry:');
}

async function ensureFolderPage({ client, parent, title, args }) {
  const existing = isDryPage(parent) ? null : await client.findChild(parent.id, title);
  if (existing) return existing;
  if (!args.apply) {
    console.log(`[dry-run] create folder page "${title}" under ${parent.id}`);
    return { id: `dry:${parent.id}/${title}`, title, space: parent.space, version: { number: 1 } };
  }
  console.log(`Creating folder page "${title}" under ${parent.id}`);
  return client.createPage({ parentId: parent.id, spaceKey: parent.space.key, title, body: '<p></p>' });
}

async function syncFile({ client, parent, filePath, title, body, args }) {
  const existing = isDryPage(parent) ? null : await client.findChild(parent.id, title);
  const relPath = relative(args.contentDir, filePath);
  if (!existing) {
    if (!args.apply) {
      console.log(`[dry-run] create page "${title}" under ${parent.id} from ${relPath}`);
      return;
    }
    console.log(`Creating page "${title}" from ${relPath}`);
    await client.createPage({ parentId: parent.id, spaceKey: parent.space.key, title, body });
    return;
  }

  if (!args.apply) {
    console.log(`[dry-run] update page "${title}" (${existing.id}) from ${relPath}`);
    return;
  }
  console.log(`Updating page "${title}" (${existing.id}) from ${relPath}`);
  await client.updatePage({ page: existing, title, body });
}

async function syncFolder({ client, folder, rootId, args }) {
  const root = await client.getPage(rootId);
  if (args.space && args.space !== root.space.key) {
    throw new Error(`Root ${rootId} for ${folder} is in space ${root.space.key}, not ${args.space}`);
  }

  const folderDir = join(args.contentDir, folder);
  for (const filePath of walkMarkdown(folderDir)) {
    const markdown = readFileSync(filePath, 'utf8');
    const rel = relative(folderDir, dirname(filePath));
    let parent = root;

    if (rel !== '') {
      for (const segment of rel.split(sep)) {
        parent = await ensureFolderPage({ client, parent, title: segmentTitle(segment), args });
      }
    }

    const title = pageTitle(markdown, filePath);
    await syncFile({ client, parent, filePath, title, body: storageBody(markdown, title), args });
  }
}

function segmentTitle(segment) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertConfig(args);
  if (!statSync(args.contentDir).isDirectory()) throw new Error(`Not a directory: ${args.contentDir}`);

  const folders = listFolders(args.contentDir, args.roots, args.only);
  if (folders.length === 0) throw new Error('No content folders matched configured roots.');
  if (args.only) {
    const unknown = [...args.only].filter(folder => !args.roots[folder]);
    if (unknown.length > 0) throw new Error(`No root page configured for: ${unknown.join(', ')}`);
  }

  console.log(`${args.apply ? 'Syncing' : 'Planning'} folders: ${folders.join(', ')}`);
  const client = new ConfluenceClient(args);
  for (const folder of folders) {
    await syncFolder({ client, folder, rootId: args.roots[folder], args });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { markdownToStorage, pageTitle, parseArgs, parseRoots, storageBody };
