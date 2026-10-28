import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { parseArgs as parseCliArgs } from 'util';

import MarkdownIt from 'markdown-it';

import { createConfluenceClient, planningClient } from './confluence-client.mjs';
import { engineDir, vaultDir as defaultContentDir } from '../src/lib/build-env.mjs';
import { renderFenceSvg } from '../src/lib/remark-fence-svg.mjs';
import { BUILD_DIAGRAM_LANGUAGES, diagramKind, fenceInfoLanguage } from '../src/lib/diagram-kinds.mjs';
import { resolveEmbed } from '../src/lib/embeds.mjs';
import { CONTENT_DIRS } from '../src/lib/collections.mjs';
import { parseFrontmatter } from '../src/lib/entry-files.mjs';
import { withoutTitleHeading } from '../src/lib/entry-title.mjs';
import { isInside, toPosix } from '../src/lib/fs-walk.mjs';
import { openVaultCatalog } from '../src/lib/vault-catalog.mjs';
import { createVaultIndex } from '../src/lib/vault-index.mjs';
import { assetPath, assetRoots, resolveVaultAsset } from '../src/lib/vault-assets.mjs';
import {
  compileDiagramFences,
  diagramKey,
  fenceLanguage,
  fenceSource,
  obsidianDialect,
} from '../src/lib/obsidian-markdown.mjs';

// Same cache the site build uses (astro.config.mjs), so a vault that has been
// built locally never recompiles a diagram just to sync it.
const diagramCacheDir = join(engineDir, '.diagram-cache');

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

Usage: teaman sync-confluence [vault] [options]

  [vault] defaults to the current directory, as for every teaman command.

Required:
  --base-url URL          Confluence base URL, e.g. https://wiki.example.com
  --user USER             Confluence username or email (or CONFLUENCE_USER)
  --token TOKEN           Confluence password/API token (or CONFLUENCE_TOKEN)
                         Use --pat/CONFLUENCE_PAT for bearer personal access tokens.
  --roots MAP            Folder-to-root ids, e.g. guides=123,notes=456
                         May also be JSON via CONFLUENCE_ROOTS='{"guides":"123"}'

Options:
  --content-dir PATH      The vault, as an option rather than [vault]
  --space KEY             Space key for newly created pages if roots are not enough
  --apply                 Write changes. Without this, prints a dry-run plan.
  --only FOLDERS          Comma-separated content folders to sync.
  --timeout-ms MS        Per-request timeout (default: 30000; CONFLUENCE_TIMEOUT_MS)
  --mermaid-macro NAME   Confluence macro name for \`\`\`mermaid fences, e.g. "mermaid"
                         (or CONFLUENCE_MERMAID_MACRO). Without it, diagrams sync as
                         a labeled code block (source only, no rendered diagram).
  --plantuml-macro NAME  Same as above for \`\`\`plantuml fences (or
                         CONFLUENCE_PLANTUML_MACRO).
  --svg-macro NAME       Confluence macro that renders raw markup, e.g. "html",
                         for local .svg images and compiled tikz/typst diagrams
                         (or CONFLUENCE_SVG_MACRO). The svg source is inlined
                         into the macro body instead of uploading a file, so it
                         renders on instances that can't preview svg
                         attachments.
  --help                  Show this help.

Examples:
  teaman sync-confluence ./vault --base-url https://wiki.local --user alice \\
    --token "$CONFLUENCE_TOKEN" --roots guides=111,notes=222 --apply

  CONFLUENCE_BASE_URL=https://wiki.local CONFLUENCE_PAT=secret \\
  CONFLUENCE_ROOTS='{"guides":"111"}' teaman sync-confluence --apply

Markdown support:
  Tables, strikethrough, headings, lists, links, images, and fenced code (with
  a best-effort Confluence "language" parameter) all translate directly.
  Obsidian wiki-links (\`[[note]]\`, \`[[note|alias]]\`, \`[[note#section]]\`)
  resolve to Confluence page links by title when the target exists under the
  "notes" folder in --content-dir, and degrade to a best-guess title link
  otherwise. Obsidian callouts (\`> [!note] Title\`) become Confluence
  info/tip/note/warning macros. GFM task lists (\`- [ ] / - [x]\`) become
  Confluence task lists. Local images — markdown \`![alt](path)\` or Obsidian
  embeds \`![[image.png]]\` — are uploaded as page attachments; images with a
  URL scheme (http, https, data, ...) link out instead of uploading. Local
  images resolve the way the site build does — against the note's own
  directory, then the vault root, then the public assets — and \`.svg\` ones
  upload as attachments by default; pass --svg-macro to inline their markup
  instead.
  \`\`\`tikz and \`\`\`typst fences compile to svg during the sync (sharing the
  site build's diagram cache) and then sync like local .svg images; a fence
  that fails to compile syncs as a labeled source block.
`);
}

/**
 * The sync's arguments. `vaultArg` is the vault as given, `[vault]` or
 * `--content-dir` (the CLI opens it like any vault); `contentDir` falls back
 * to the env seam's vault, which under the CLI is that one, or the current
 * directory. `help` is all there is when it is asked for.
 *
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const { values, positionals } = parseCliArgs({
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
      'mermaid-macro': { type: 'string' },
      'plantuml-macro': { type: 'string' },
      'svg-macro': { type: 'string' },
    },
    allowPositionals: true,
  });

  if (values.help) return { help: true };
  if (positionals.length > 1) throw new Error(`Expected one vault, got: ${positionals.join(' ')}`);
  if (positionals.length === 1 && values['content-dir']) {
    throw new Error('Name the vault once: as [vault] or as --content-dir, not both');
  }
  const vaultArg = positionals[0] ?? values['content-dir'];

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
    vaultArg,
    contentDir: vaultArg ?? defaultContentDir,
    apply: values.apply ?? false,
    only: values.only ? new Set(values.only.split(',').map(s => s.trim()).filter(Boolean)) : null,
    space: values.space ?? process.env.CONFLUENCE_SPACE,
    timeoutMs: parseTimeout(values['timeout-ms'] ?? process.env.CONFLUENCE_TIMEOUT_MS),
    mermaidMacro: values['mermaid-macro'] ?? process.env.CONFLUENCE_MERMAID_MACRO ?? null,
    plantumlMacro: values['plantuml-macro'] ?? process.env.CONFLUENCE_PLANTUML_MACRO ?? null,
    svgMacro: values['svg-macro'] ?? process.env.CONFLUENCE_SVG_MACRO ?? null,
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

// Only vault content folders sync: a root for anything else names nothing the
// site publishes.
function listFolders(contentDir, roots, only) {
  return readdirSync(contentDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => roots[name] && CONTENT_DIRS.includes(name))
    .filter(name => !only || only.has(name))
    .sort();
}

/**
 * The pages a sync makes of one content folder: a page per file of a page the
 * site renders under it (the vault index's file entries, so drafts, `_` paths,
 * SUMMARY.md indexes, and chapters no SUMMARY.md lists stay behind), in path
 * order. `folders` are the folder pages it sits under, one per directory
 * between the content folder and the file. Every title is `pageTitles`'.
 *
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} catalog
 * @param {import('../src/lib/vault-index.mjs').VaultIndex} index  the catalog's
 * @param {string} folder
 * @returns {Array<{ sourcePath: string, title: string, folders: string[] }>}
 */
function folderPagePlan(catalog, index, folder) {
  const folderDir = join(catalog.vaultDir, folder);
  const titles = pageTitles(catalog, index);
  return index.entries
    .filter(entry => entry.kind === 'file' && isInside(folderDir, entry.sourcePath))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
    .map(({ sourcePath }) => {
      const rel = relative(folderDir, dirname(sourcePath));
      const segments = rel ? rel.split(sep) : [];
      const folders = segments.map((segment, at) => titles.get(join(folderDir, ...segments.slice(0, at + 1))));
      return { sourcePath, title: titles.get(sourcePath), folders };
    });
}

const titleCache = new WeakMap();

/**
 * The Confluence title of every page a sync of the vault can make: a page per
 * file the site renders, titled as the site titles it, and a folder page per
 * directory between a content folder and such a file — a guide's or a
 * reference book's titled as the site titles the book, any other after its
 * name. Confluence addresses a page by its title — once per space, ignoring
 * case — and the sync finds the page to update or the folder to reuse by it,
 * so pages that share a title would merge, each sync overwriting the last.
 * Each of those is told apart by its vault path instead
 * (`Overview (guides/setup/one)`, `Manual (guides/a)`). Worked out over the
 * whole vault, so a page and every link to it agree whichever folders a run
 * syncs.
 *
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} catalog
 * @param {import('../src/lib/vault-index.mjs').VaultIndex} index  the catalog's
 * @returns {Map<string, string>}  absolute file or directory → title
 */
function pageTitles(catalog, index) {
  if (titleCache.has(index)) return titleCache.get(index);
  const { vaultDir } = catalog;
  const bookTitles = new Map([
    ...index.entries.filter(entry => entry.kind === 'folder').map(entry => [entry.sourcePath, entry.title]),
    ...catalog.published('reference').filter(document => document.kind === 'book')
      .map(document => [dirname(document.sourcePath), document.title]),
  ]);
  const files = index.entries.filter(entry => entry.kind === 'file');
  /** @type {Map<string, { title: string, path: string }>} */
  const pages = new Map(files.map(entry => [entry.sourcePath, { title: entry.title, path: entry.path }]));
  // A directory beside a page of its own path and title (`items.md` titled
  // Items, and `items/`, as mdBook nests chapters) is that page: its pages
  // sync under it. Told apart by path they would still share a title, so
  // they could never sync as two; a folder page titled otherwise keeps its
  // own place, as the pages under it already have on Confluence.
  const key = title => title.toLowerCase();
  const pageAt = new Map(files.map(entry => [entry.path, entry]));
  const nested = new Map();
  for (const entry of files) {
    const [top, ...rest] = entry.path.split('/');
    let dir = join(vaultDir, top);
    for (const segment of rest.slice(0, -1)) {
      dir = join(dir, segment);
      if (pages.has(dir) || nested.has(dir)) continue;
      const path = toPosix(relative(vaultDir, dir));
      const title = bookTitles.get(dir) ?? segmentTitle(segment);
      const page = pageAt.get(path);
      if (page && key(page.title) === key(title)) nested.set(dir, page.sourcePath);
      else pages.set(dir, { title, path });
    }
  }

  const sharing = new Map();
  for (const { title } of pages.values()) sharing.set(key(title), (sharing.get(key(title)) ?? 0) + 1);
  const titles = new Map([...pages].map(([sourcePath, { title, path }]) =>
    [sourcePath, sharing.get(key(title)) > 1 ? `${title} (${path})` : title]));
  // A told-apart title can still meet a page titled that way on purpose.
  const seen = new Map();
  for (const [sourcePath, title] of titles) {
    const other = seen.get(key(title));
    if (other) throw new Error(`Two pages would sync as "${title}": ${other} and ${sourcePath} — give one a different title`);
    seen.set(key(title), sourcePath);
  }
  for (const [dir, sourcePath] of nested) titles.set(dir, titles.get(sourcePath));
  titleCache.set(index, titles);
  return titles;
}

// Resolves a wiki-link to the title of the Confluence page for the file it
// names. Resolution is the site's own (vault-index.mjs: any rendered type,
// Obsidian's tie-breaks) and the title is the page's (`pageTitles`), so a
// link lands on the same document in both places. A guide resolves to its
// folder page.
function buildLinkTitles(index, titles = new Map()) {
  return (target, fromPath) => {
    const entry = index.resolve(target, fromPath ?? undefined)?.entry;
    return entry ? titles.get(entry.sourcePath) ?? entry.title : null;
  };
}

function codeMacro(lines, { language, title } = {}) {
  const params = [];
  if (language) params.push(`<ac:parameter ac:name="language">${markdownRenderer.utils.escapeHtml(language)}</ac:parameter>`);
  if (title) params.push(`<ac:parameter ac:name="title">${markdownRenderer.utils.escapeHtml(title)}</ac:parameter>`);
  return `<ac:structured-macro ac:name="code">${params.join('')}<ac:plain-text-body><![CDATA[${escapeCdata(lines.join('\n'))}]]></ac:plain-text-body></ac:structured-macro>`;
}

function diagramMacro(macroName, source) {
  return `<ac:structured-macro ac:name="${macroName}"><ac:plain-text-body><![CDATA[${escapeCdata(source)}]]></ac:plain-text-body></ac:structured-macro>`;
}

function escapeCdata(value) {
  return value.replaceAll(']]>', ']]]]><![CDATA[>');
}

// Best-effort alias table for Confluence's code macro `language` parameter.
// Unlisted languages are passed through as-is (lowercased): recent Confluence
// versions recognize far more languages than the classic fixed list, and an
// unrecognized value just falls back to no highlighting rather than erroring.
const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  c: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  rs: 'rust',
  golang: 'go',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  cs: 'c#',
  csharp: 'c#',
  md: 'none',
  markdown: 'none',
  text: 'none',
  txt: 'none',
  plaintext: 'none',
  html: 'xml',
  htm: 'xml',
};

function confluenceLanguage(lang) {
  if (!lang) return 'none';
  return LANGUAGE_ALIASES[lang] ?? lang;
}

// Obsidian ships far more callout types than Confluence has admonition
// macros for (info/tip/note/warning). This maps every stock Obsidian type
// onto its closest Confluence macro so a callout never falls back to a
// plain, unstyled blockquote.
const CALLOUT_MACROS = {
  note: 'info',
  info: 'info',
  todo: 'info',
  abstract: 'info',
  summary: 'info',
  tldr: 'info',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'tip',
  check: 'tip',
  done: 'tip',
  question: 'note',
  help: 'note',
  faq: 'note',
  quote: 'note',
  cite: 'note',
  example: 'note',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'warning',
  error: 'warning',
  bug: 'warning',
  failure: 'warning',
  fail: 'warning',
  missing: 'warning',
};

function calloutMacroName(type) {
  return CALLOUT_MACROS[type.toLowerCase()] ?? 'note';
}

// The Obsidian dialect (wiki-links, embeds, callouts) is shared with the
// reference PDF; see obsidian-markdown.mjs.
const markdownRenderer = new MarkdownIt({
  html: false,
  xhtmlOut: true,
  linkify: true,
}).use(obsidianDialect);

markdownRenderer.renderer.rules.fence = renderCodeToken;
markdownRenderer.renderer.rules.code_block = renderCodeToken;
markdownRenderer.renderer.rules.thead_open = () => '<tbody>\n';
markdownRenderer.renderer.rules.thead_close = () => '';
markdownRenderer.renderer.rules.tbody_open = () => '';
markdownRenderer.renderer.rules.tbody_close = () => '</tbody>\n';

function renderCodeToken(tokens, idx, options, env) {
  const token = tokens[idx];
  const lang = fenceLanguage(token);
  // The code macro takes the author's language as written (`c#`, `c++`);
  // the normalized one only decides whether this is a diagram fence.
  const rawLang = fenceInfoLanguage(token.info);
  const source = fenceSource(token);
  const kind = diagramKind(lang);
  const sourceBlock = () => `${codeMacro(source.split('\n'), { language: 'none', title: `${kind.label} diagram (source)` })}\n`;

  // A browser-rendered diagram syncs as the macro configured for it, or as
  // its source.
  if (kind?.render === 'client') {
    const macro = { mermaid: env.mermaidMacro, plantuml: env.plantumlMacro }[lang];
    return macro ? diagramMacro(macro, source) : sourceBlock();
  }

  // Build-time diagrams were compiled to svg by pageStorage's pre-pass before
  // this (synchronous) render; the results ride in env and sync exactly like
  // local .svg images. No compiled entry (compile failed, or no pre-pass ran)
  // syncs the source.
  if (kind?.render === 'build') {
    const found = env.fenceSvgs?.get(diagramKey(token));
    const compiled = found && !found.error ? found : null;
    if (compiled && env.svgMacro) return `${diagramMacro(env.svgMacro, compiled.svg)}\n`;
    if (compiled) {
      const filename = queueImage(compiled.path, env);
      return `<ac:image ac:alt="${lang} diagram"><ri:attachment ri:filename="${markdownRenderer.utils.escapeHtml(filename)}" /></ac:image>\n`;
    }
    return sourceBlock();
  }

  return `${codeMacro(source.split('\n'), { language: confluenceLanguage(rawLang) })}\n`;
}

// Obsidian wiki-links (`[[target|label]]`) and embeds (`![[image.png]]`),
// tokenized by the shared dialect.
markdownRenderer.renderer.rules.wiki_link = (tokens, idx, options, env) => {
  const { target, label: alias, embed } = tokens[idx].meta;
  if (embed) {
    const found = resolveEmbed(target, alias, { resolveAttachment: env.resolveAttachment, fromFile: env.filePath });
    if (found.problem) throw new Error(`${env.filePath ?? 'page'}: ${found.problem}`);
    const name = markdownRenderer.utils.escapeHtml(found.caption ?? found.target);
    // Confluence cannot run the page; leave a labelled note where it sits,
    // as the reference PDF does. Inline, since the embed sits inside a
    // paragraph.
    if (found.kind === 'html') return `<em>Interactive embed: ${name} — open the online version to use it.</em>`;
    return renderImageFile(found.file, name, env, found);
  }

  // `#section` / `#^block` anchors have no stable Confluence equivalent:
  // links address pages. A bare `[[#heading]]` degrades to plain text.
  const hashIdx = target.indexOf('#');
  const page = (hashIdx === -1 ? target : target.slice(0, hashIdx)).trim();
  if (!page) return markdownRenderer.utils.escapeHtml(alias);

  const title = env.linkTitle?.(page, env.filePath) ?? segmentTitle(page);
  return `<ac:link><ri:page ri:content-title="${markdownRenderer.utils.escapeHtml(title)}" /><ac:plain-text-link-body><![CDATA[${escapeCdata(alias)}]]></ac:plain-text-link-body></ac:link>`;
};

// Local images upload as page attachments (collected into env.images,
// uploaded by syncAttachments once the page id is known); anything with a
// URL scheme (http, https, data, ...) or protocol-relative form links out
// via Confluence's <ri:url> instead.
markdownRenderer.renderer.rules.image = (tokens, idx, options, env) => {
  const token = tokens[idx];
  const src = token.attrGet('src') ?? '';
  const alt = markdownRenderer.utils.escapeHtml(token.content || token.attrGet('alt') || '');

  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) {
    return `<ac:image ac:alt="${alt}"><ri:url ri:value="${markdownRenderer.utils.escapeHtml(src)}" /></ac:image>`;
  }
  return renderImageRef(src, alt, env);
};

function decodePath(src) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

// Local images resolve as on the site and in the PDF (`resolveVaultAsset`):
// the note's own directory, then the vault root, then the public roots. When
// nothing matches, the note-relative guess is returned so the upload step
// warns with a sensible path instead of failing silently here.
function resolveImagePath(path, env) {
  const roots = env.contentDir ? assetRoots(env.contentDir, { engineDir }) : [];
  return resolveVaultAsset(path, { fromFile: env.filePath, roots })
    ?? resolve(dirname(env.filePath), assetPath(path));
}

// The svg file's markup, trimmed to the root <svg> tag (dropping BOM/XML
// prolog/doctype — Confluence's html macro wants an element, not a document);
// null when the file is unreadable or has no <svg> root.
function svgSource(absolutePath) {
  let source;
  try {
    source = readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
  const start = source.search(/<svg[\s>]/i);
  return start === -1 ? null : source.slice(start).trim();
}

function renderImageRef(path, alt, env) {
  if (!env.filePath) {
    return `<img src="${markdownRenderer.utils.escapeHtml(decodePath(path))}" alt="${alt}" />`;
  }
  return renderImageFile(resolveImagePath(path, env), alt, env);
}

function renderImageFile(absolutePath, alt, env, { width, height } = {}) {
  if (env.svgMacro && absolutePath.toLowerCase().endsWith('.svg')) {
    const svg = svgSource(absolutePath);
    if (svg !== null) return diagramMacro(env.svgMacro, svg);
    // Missing file or no <svg> root: fall through to the attachment path so
    // the upload step surfaces the standard "image not found" warning.
  }
  const filename = queueImage(absolutePath, env);
  const size = `${width ? ` ac:width="${width}"` : ''}${height ? ` ac:height="${height}"` : ''}`;
  return `<ac:image ac:alt="${alt}"${size}><ri:attachment ri:filename="${markdownRenderer.utils.escapeHtml(filename)}" /></ac:image>`;
}

// Confluence attachment filenames are flat per page, so same-named images
// from different directories must not share a filename or the second upload
// overwrites the first. On collision, prefix with parent directory segments
// (walking up the image's full path until unique) so the disambiguation is
// derived from where the file lives, not from document order.
function queueImage(absolutePath, env) {
  const existing = env.images.find(image => image.absolutePath === absolutePath);
  if (existing) return existing.filename;

  const taken = name => env.images.some(image => image.filename === name);
  const base = basename(absolutePath);
  let filename = base;
  const segments = dirname(absolutePath).split(sep).filter(Boolean);
  for (let i = segments.length - 1; i >= 0 && taken(filename); i -= 1) {
    filename = `${segments.slice(i).join('-')}-${base}`.replace(/\s+/g, '-');
  }
  for (let n = 2; taken(filename); n += 1) filename = `${n}-${base}`;

  env.images.push({ absolutePath, filename });
  return filename;
}

// Renders inline markdown down to what Confluence macro parameters accept:
// plain text, HTML-escaped (tags stripped, CDATA wrappers unwrapped).
function inlineText(markdown, env) {
  return markdownRenderer.renderInline(markdown, env ?? {})
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/<[^>]*>/g, '');
}

// Obsidian callouts (`> [!type] Title`, marked by the shared dialect) become
// Confluence info/tip/note/warning macros. The +/- fold marker is not
// reproduced: Confluence's admonition macros aren't collapsible, so every
// callout syncs expanded.
markdownRenderer.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
  const callout = tokens[idx].meta?.callout;
  if (!callout) return self.renderToken(tokens, idx, options);
  const title = callout.title
    ? inlineText(callout.title, env)
    : markdownRenderer.utils.escapeHtml(segmentTitle(callout.type));
  return `<ac:structured-macro ac:name="${calloutMacroName(callout.type)}"><ac:parameter ac:name="title">${title}</ac:parameter><ac:rich-text-body>\n`;
};
markdownRenderer.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
  if (!tokens[idx].meta?.callout) return self.renderToken(tokens, idx, options);
  return '</ac:rich-text-body></ac:structured-macro>\n';
};

// GFM task lists (`- [ ] foo` / `- [x] foo`): a bullet list where every item
// starts with a checkbox marker becomes a Confluence <ac:task-list>. Mixed
// lists (some items are tasks, some aren't) are left as plain lists.
const TASK_ITEM_RE = /^\[([ xX])\](?:\s+(.*))?$/;

function findItemInline(tokens, itemOpenIdx) {
  const paraOpen = tokens[itemOpenIdx + 1];
  const inline = tokens[itemOpenIdx + 2];
  if (paraOpen?.type !== 'paragraph_open' || inline?.type !== 'inline' || !inline.children?.length) return null;
  const first = inline.children[0];
  if (first.type !== 'text') return null;
  const match = TASK_ITEM_RE.exec(first.content);
  if (!match) return null;
  return { inline, first, status: /[xX]/.test(match[1]) ? 'complete' : 'incomplete', text: match[2] ?? '' };
}

markdownRenderer.core.ruler.push('task_lists', state => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'bullet_list_open') continue;

    const level = tokens[i].level;
    const itemLevel = level + 1;
    const itemIndexes = [];
    let closeIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === 'bullet_list_close' && tokens[j].level === level) {
        closeIdx = j;
        break;
      }
      if (tokens[j].type === 'list_item_open' && tokens[j].level === itemLevel) itemIndexes.push(j);
    }
    if (closeIdx === -1 || itemIndexes.length === 0) continue;

    const items = itemIndexes.map(itemIdx => ({ itemIdx, task: findItemInline(tokens, itemIdx) }));
    if (items.some(item => !item.task)) continue;

    tokens[i].type = 'task_list_open';
    tokens[closeIdx].type = 'task_list_close';

    for (const { itemIdx, task } of items) {
      let itemCloseIdx = -1;
      for (let j = itemIdx + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'list_item_close' && tokens[j].level === itemLevel) {
          itemCloseIdx = j;
          break;
        }
      }
      if (itemCloseIdx === -1) continue;

      tokens[itemIdx].type = 'task_item_open';
      tokens[itemIdx].taskStatus = task.status;
      tokens[itemCloseIdx].type = 'task_item_close';
      task.first.content = task.text;
    }
  }
});

markdownRenderer.renderer.rules.task_list_open = () => '<ac:task-list>\n';
markdownRenderer.renderer.rules.task_list_close = () => '</ac:task-list>\n';
markdownRenderer.renderer.rules.task_item_open = (tokens, idx, options, env) => {
  env.taskId = (env.taskId ?? 0) + 1;
  return `<ac:task><ac:task-id>${env.taskId}</ac:task-id><ac:task-status>${tokens[idx].taskStatus}</ac:task-status><ac:task-body>`;
};
markdownRenderer.renderer.rules.task_item_close = () => '</ac:task-body></ac:task>\n';

// markdown-it rendering is synchronous but the tikz/typst compilers are not,
// so fences compile in this pre-pass (the shared dialect's) and
// renderCodeToken looks the results up. Renders come from the site build's
// content-hash cache when available; a fence that fails to compile syncs as
// its labeled source block, with a console warning, like the site build's
// visible notice.
async function compileFenceSvgs(body, { cacheDir, compilers }) {
  return compileDiagramFences(markdownRenderer.parse(body, {}), {
    languages: BUILD_DIAGRAM_LANGUAGES,
    cacheDir,
    compilers,
    onError: (lang, reason) => console.warn(`Warning: ${lang} fence failed to compile, syncing its source instead: ${reason}`),
  });
}

/**
 * @typedef {object} StoragePage
 * @property {string} [filePath]  the file being synced: wiki-links and images
 *   resolve from it
 * @property {string} [vaultDir]  whose public roots images also resolve against
 * @property {Pick<import('../src/lib/vault-index.mjs').VaultIndex, 'resolve' | 'resolveAttachment'>} [index]
 *   the vault index, which resolves wiki-links and finds embeds; without one
 *   a link gets a guessed title and every embed is missing
 * @property {Map<string, string>} [titles]  the sync's page titles
 *   (`pageTitles`), which links are titled by; without them, a link takes
 *   its target's site title
 * @property {{ mermaid?: string | null, plantuml?: string | null, svg?: string | null }} [macros]
 *   Confluence macros for client diagrams and for svg markup
 */

/**
 * One vault page as Confluence storage: frontmatter and the title heading
 * dropped, diagram fences compiled (through the site's diagram cache), local
 * images collected in `images` for upload.
 *
 * @param {string} markdown  the file as written
 * @param {StoragePage & { cacheDir?: string, compilers?: object }} [page]
 *   `compilers` replace the diagram compilers, as in `renderFenceSvg`
 * @returns {Promise<{ html: string, images: Array<{ absolutePath: string, filename: string }> }>}
 */
async function pageStorage(markdown, { cacheDir = diagramCacheDir, compilers, ...page } = {}) {
  const body = withoutTitleHeading(parseFrontmatter(markdown).content);
  return markdownToStorage(body, { ...page, fenceSvgs: await compileFenceSvgs(body, { cacheDir, compilers }) });
}

/**
 * The formatting `pageStorage` does, synchronously, on a body: diagram fences
 * render from `fenceSvgs` (its pre-pass), and as their source without it.
 *
 * @param {string} markdown  frontmatter removed
 * @param {StoragePage & { fenceSvgs?: Map<string, object> }} [page]
 */
function markdownToStorage(markdown, { filePath, vaultDir, index, titles, macros = {}, fenceSvgs } = {}) {
  const env = {
    filePath: filePath ?? null,
    contentDir: vaultDir ?? null,
    linkTitle: index ? buildLinkTitles(index, titles) : null,
    resolveAttachment: index?.resolveAttachment ?? null,
    mermaidMacro: macros.mermaid ?? null,
    plantumlMacro: macros.plantuml ?? null,
    svgMacro: macros.svg ?? null,
    fenceSvgs: fenceSvgs ?? null,
    images: [],
    taskId: 0,
  };
  return { html: markdownRenderer.render(markdown, env).trimEnd(), images: env.images };
}

/**
 * @typedef {import('./confluence-client.mjs').ConfluenceClient} ConfluenceClient
 * @typedef {import('./confluence-client.mjs').ConfluencePage} ConfluencePage
 *
 * One change a sync makes (or, through `planningClient`, would make). `file`
 * is vault-relative.
 * @typedef {{ action: 'create-folder', title: string, parent: string }
 *   | { action: 'create-page', title: string, parent: string, file: string }
 *   | { action: 'update-page', title: string, page: string, file: string }
 *   | { action: 'create-attachment' | 'update-attachment', filename: string, page: string, file: string }} SyncOperation
 */

/** One line of the sync's log for an operation. */
export function describeOperation(operation) {
  switch (operation.action) {
    case 'create-folder': return `create folder page "${operation.title}" under ${operation.parent}`;
    case 'create-page': return `create page "${operation.title}" under ${operation.parent} from ${operation.file}`;
    case 'update-page': return `update page "${operation.title}" (${operation.page}) from ${operation.file}`;
    case 'create-attachment': return `upload attachment "${operation.filename}" (${operation.file}) to ${operation.page}`;
    case 'update-attachment': return `update attachment "${operation.filename}" (${operation.file}) on ${operation.page}`;
  }
}

/**
 * Sync the pages the site publishes from each of `folders` under that
 * folder's root page, as `folderPagePlan` lays them out, with their local
 * images attached.
 * A page or attachment that exists (by title, by filename) is updated.
 *
 * @param {object} options
 * @param {import('../src/lib/vault-catalog.mjs').VaultCatalog} options.catalog
 * @param {ConfluenceClient} options.client  `createConfluenceClient`, or
 *   `planningClient` around it for a dry run
 * @param {string[]} options.folders  content folders, each with a root
 * @param {Record<string, string>} options.roots  folder → root page id
 * @param {string} [options.space]  the space every root must be in
 * @param {{ mermaid?: string | null, plantuml?: string | null, svg?: string | null }} [options.macros]
 * @param {(operation: SyncOperation) => void} [options.onOperation]  called as
 *   each operation is made
 * @param {(message: string) => void} [options.warn]
 * @returns {Promise<SyncOperation[]>}
 */
export async function syncVault({
  catalog,
  client,
  folders,
  roots,
  space,
  macros = {},
  onOperation = () => {},
  warn = message => console.warn(message),
}) {
  const vaultDir = catalog.vaultDir;
  const vaultIndex = createVaultIndex(vaultDir, { catalog });
  const titles = pageTitles(catalog, vaultIndex);
  const operations = [];
  const record = operation => {
    operations.push(operation);
    onOperation(operation);
  };
  const vaultPath = path => relative(vaultDir, path);

  // Confluence takes a title once per space, so the page this sync makes
  // under `parent` is the one with its title anywhere in the space. Found
  // under another parent, it is not this sync's to update, and creating the
  // page would fail.
  async function findPageUnder(parent, title) {
    const page = await client.findPage(parent.space.key, title);
    if (page && page.ancestors?.at(-1)?.id !== parent.id) {
      throw new Error(`Page "${title}" (${page.id}) already exists in space ${parent.space.key}, but not under ${parent.id}; move or rename it`);
    }
    return page;
  }

  async function ensureFolderPage(parent, title) {
    const existing = await findPageUnder(parent, title);
    if (existing) return existing;
    record({ action: 'create-folder', title, parent: parent.id });
    return client.createPage({ parentId: parent.id, spaceKey: parent.space.key, title, body: '<p></p>' });
  }

  async function syncAttachments(page, images) {
    for (const image of images) {
      let stat;
      try {
        stat = statSync(image.absolutePath);
      } catch {
        warn(`Warning: image not found, skipping: ${vaultPath(image.absolutePath)}`);
        continue;
      }
      if (!stat.isFile()) continue;
      const file = vaultPath(image.absolutePath);
      const existing = await client.findAttachment(page.id, image.filename);
      const buffer = readFileSync(image.absolutePath);
      if (existing) {
        record({ action: 'update-attachment', filename: image.filename, page: page.id, file });
        await client.updateAttachmentData(page.id, existing.id, buffer, image.filename);
      } else {
        record({ action: 'create-attachment', filename: image.filename, page: page.id, file });
        await client.createAttachment(page.id, buffer, image.filename);
      }
    }
  }

  async function syncFile(parent, { sourcePath: filePath, title }) {
    const markdown = readFileSync(filePath, 'utf8');
    const { html: body, images } = await pageStorage(markdown, { filePath, vaultDir, index: vaultIndex, titles, macros });
    const file = vaultPath(filePath);
    const existing = await findPageUnder(parent, title);
    let page;
    if (existing) {
      record({ action: 'update-page', title, page: existing.id, file });
      page = (await client.updatePage({ page: existing, title, body })) ?? existing;
    } else {
      record({ action: 'create-page', title, parent: parent.id, file });
      // Some deployments answer content writes with an empty body; recover
      // the page id rather than losing its attachments after the write
      // already succeeded.
      page = await client.createPage({ parentId: parent.id, spaceKey: parent.space.key, title, body })
        ?? await findPageUnder(parent, title);
    }
    if (!page) {
      if (images.length > 0) warn(`Warning: could not determine the page id for "${title}"; skipping ${images.length} attachment(s).`);
      return;
    }
    await syncAttachments(page, images);
  }

  for (const folder of folders) {
    const root = await client.getPage(roots[folder]);
    if (space && space !== root.space.key) {
      throw new Error(`Root ${roots[folder]} for ${folder} is in space ${root.space.key}, not ${space}`);
    }
    for (const page of folderPagePlan(catalog, vaultIndex, folder)) {
      let parent = root;
      for (const title of page.folders) parent = await ensureFolderPage(parent, title);
      await syncFile(parent, page);
    }
  }
  return operations;
}

function segmentTitle(segment) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  assertConfig(args);
  if (!statSync(args.contentDir).isDirectory()) throw new Error(`Not a directory: ${args.contentDir}`);

  const folders = listFolders(args.contentDir, args.roots, args.only);
  if (folders.length === 0) throw new Error('No content folders matched configured roots.');
  if (args.only) {
    const unknown = [...args.only].filter(folder => !args.roots[folder]);
    if (unknown.length > 0) throw new Error(`No root page configured for: ${unknown.join(', ')}`);
  }

  const ignored = Object.keys(args.roots).filter(folder => !CONTENT_DIRS.includes(folder));
  if (ignored.length > 0) console.warn(`Ignoring roots for non-content folders: ${ignored.join(', ')}`);

  console.log(`${args.apply ? 'Syncing' : 'Planning'} ${resolve(args.contentDir)}: ${folders.join(', ')}`);
  const client = createConfluenceClient(args);
  await syncVault({
    catalog: openVaultCatalog(args.contentDir),
    client: args.apply ? client : planningClient(client),
    folders,
    roots: args.roots,
    space: args.space,
    macros: { mermaid: args.mermaidMacro, plantuml: args.plantumlMacro, svg: args.svgMacro },
    onOperation: operation => console.log(`${args.apply ? '' : '[dry-run] '}${describeOperation(operation)}`),
  });
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { buildLinkTitles, folderPagePlan, markdownToStorage, pageStorage, parseArgs, parseRoots };
