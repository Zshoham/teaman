import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { parseArgs as parseCliArgs } from 'util';
import { fileURLToPath } from 'url';

import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

import { fenceLanguages, renderFenceSvg } from '../src/lib/remark-fence-svg.mjs';

const engineDir = fileURLToPath(new URL('..', import.meta.url));
const defaultContentDir = join(engineDir, 'example');

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
  node scripts/sync-confluence.mjs --base-url https://wiki.local --user alice \\
    --token "$CONFLUENCE_TOKEN" --roots guides=111,notes=222 --apply

  CONFLUENCE_BASE_URL=https://wiki.local CONFLUENCE_PAT=secret \\
  CONFLUENCE_ROOTS='{"guides":"111"}' npm run sync:confluence -- --apply

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
  \`.svg\` images resolve the way the site build does — against the note's own
  directory, then the vault root, then \`<vault>/public\` — and upload as
  attachments by default; pass --svg-macro to inline their markup instead.
  \`\`\`tikz and \`\`\`typst fences compile to svg during the sync (sharing the
  site build's diagram cache) and then sync like local .svg images; a fence
  that fails to compile syncs as a labeled source block.
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
      'mermaid-macro': { type: 'string' },
      'plantuml-macro': { type: 'string' },
      'svg-macro': { type: 'string' },
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

// Builds a slug -> page title map for every note under <contentDir>/notes, so
// wiki-links can resolve to a real Confluence page title regardless of which
// folder(s) are actually being synced this run. Mirrors the slug rule
// astro.config.mjs's remark-wiki-link pageResolver uses (name.replace(' ',
// '-').toLowerCase()) against note filenames, which is the same convention
// the built site relies on for [[wiki-link]] hrefs to resolve correctly.
function buildNotesMap(contentDir) {
  const notesDir = join(contentDir, 'notes');
  const map = new Map();
  let stats;
  try {
    stats = statSync(notesDir);
  } catch {
    return map;
  }
  if (!stats.isDirectory()) return map;

  for (const filePath of walkMarkdown(notesDir)) {
    const markdown = readFileSync(filePath, 'utf8');
    const slug = basename(filePath, '.md').replace(/ /g, '-').toLowerCase();
    const title = pageTitle(markdown, filePath);
    const existing = map.get(slug);
    if (existing !== undefined && existing !== title) {
      console.warn(`Warning: multiple notes share the wiki-link slug "${slug}"; [[${slug}]] links will resolve to "${title}".`);
    }
    map.set(slug, title);
  }
  return map;
}

function storageBody(markdown, title, context = {}) {
  const parsed = matter(markdown);
  return markdownToStorage(stripMatchingLeadingH1(parsed.content, title), context);
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

// `> [!type] Title` / `> [!type]+ Title` / `> [!type]- Title`. The +/-
// (expanded/collapsed) marker is accepted but not reproduced: Confluence's
// admonition macros aren't collapsible, so every callout syncs expanded.
const CALLOUT_MARKER_RE = /^\[!([a-zA-Z][\w-]*)\]([+-])?\s*(.*)$/;

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

// Display names for the compiled-diagram fences' source-block fallback,
// matching the 'Mermaid diagram (source)' style.
const FENCE_LABELS = { tikz: 'TikZ', typst: 'Typst' };

const fenceKey = (lang, source) => `${lang}\0${source}`;

function renderCodeToken(tokens, idx, options, env) {
  const token = tokens[idx];
  const lang = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
  const source = token.content.replace(/\n$/, '');

  if (lang === 'mermaid' && env.mermaidMacro) return diagramMacro(env.mermaidMacro, source);
  if (lang === 'plantuml' && env.plantumlMacro) return diagramMacro(env.plantumlMacro, source);
  if (lang === 'mermaid') return `${codeMacro(source.split('\n'), { language: 'none', title: 'Mermaid diagram (source)' })}\n`;
  if (lang === 'plantuml') return `${codeMacro(source.split('\n'), { language: 'none', title: 'PlantUML diagram (source)' })}\n`;

  // tikz/typst fences were compiled to svg by compileFenceSvgs before this
  // (synchronous) render; the results ride in env and sync exactly like local
  // .svg images. No compiled entry (compile failed, or the caller skipped the
  // pre-pass, as unit tests do) syncs the source, labeled like mermaid above.
  if (fenceLanguages.includes(lang)) {
    const compiled = env.fenceSvgs?.get(fenceKey(lang, source));
    if (compiled && env.svgMacro) return `${diagramMacro(env.svgMacro, compiled.svg)}\n`;
    if (compiled) {
      const filename = queueImage(compiled.path, env);
      return `<ac:image ac:alt="${lang} diagram"><ri:attachment ri:filename="${markdownRenderer.utils.escapeHtml(filename)}" /></ac:image>\n`;
    }
    return `${codeMacro(source.split('\n'), { language: 'none', title: `${FENCE_LABELS[lang] ?? segmentTitle(lang)} diagram (source)` })}\n`;
  }

  return `${codeMacro(source.split('\n'), { language: confluenceLanguage(lang) })}\n`;
}

// Obsidian wiki-links: `[[target]]` / `[[target|alias]]`, and embeds
// (`![[image.png]]`). Registered ahead of the standard `link` rule so `[[`
// is never mistaken for the start of a normal markdown link; the embed form
// must be matched here too, or the leading `!` falls through as literal text.
function wikiLinkRule(state, silent) {
  const start = state.pos;
  let pos = start;
  const embed = state.src.charCodeAt(pos) === 0x21; /* ! */
  if (embed) pos += 1;
  if (state.src.charCodeAt(pos) !== 0x5b || state.src.charCodeAt(pos + 1) !== 0x5b) return false;

  const end = state.src.indexOf(']]', pos + 2);
  if (end === -1) return false;

  const inner = state.src.slice(pos + 2, end);
  if (!inner || inner.includes('\n')) return false;

  const pipeIdx = inner.indexOf('|');
  const target = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
  const alias = (pipeIdx === -1 ? inner : inner.slice(pipeIdx + 1)).trim();
  if (!target) return false;

  if (!silent) {
    const token = state.push('wiki_link', '', 0);
    token.meta = { target, alias: alias || target, embed };
  }
  state.pos = end + 2;
  return true;
}

const WIKI_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

markdownRenderer.inline.ruler.before('link', 'wiki_link', wikiLinkRule);
markdownRenderer.renderer.rules.wiki_link = (tokens, idx, options, env) => {
  const { target, alias, embed } = tokens[idx].meta;
  if (embed && WIKI_IMAGE_RE.test(target)) {
    return renderImageRef(target, markdownRenderer.utils.escapeHtml(alias), env);
  }

  // `#section` / `#^block` anchors have no stable Confluence equivalent:
  // strip them for the page lookup (keeping them would miss the notes map
  // and link to a nonexistent title). A bare `[[#heading]]` degrades to
  // plain text; non-image embeds (note transclusion) degrade to page links.
  const hashIdx = target.indexOf('#');
  const page = (hashIdx === -1 ? target : target.slice(0, hashIdx)).trim();
  if (!page) return markdownRenderer.utils.escapeHtml(alias);

  const slug = page.replace(/ /g, '-').toLowerCase();
  const title = env.notesMap?.get(slug) ?? segmentTitle(slug);
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
  return renderImageRef(decodePath(src), alt, env);
};

function decodePath(src) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

// Local `.svg` images resolve the way the site build does (remark-inline-svg):
// against the note's own directory first, then the vault root, then
// `<vault>/public` — in an Obsidian vault attachments live anywhere, and the
// site also accepts site-root-style `/images/x.svg` references. Other images
// keep the plain note-relative rule. When no candidate exists, the
// note-relative guess is returned so the upload step warns with a sensible
// path instead of failing silently here.
function resolveImagePath(path, env) {
  const noteDir = dirname(env.filePath);
  const clean = path.split(/[?#]/)[0];
  if (!clean.toLowerCase().endsWith('.svg')) return resolve(noteDir, path);

  const rel = clean.replace(/^\/+/, '');
  const candidates = [
    ...(clean.startsWith('/') ? [] : [resolve(noteDir, clean)]),
    ...(env.contentDir ? [join(env.contentDir, rel), join(env.contentDir, 'public', rel)] : []),
  ];
  return candidates.find(existsSync) ?? candidates[0] ?? resolve(noteDir, clean);
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
    return `<img src="${markdownRenderer.utils.escapeHtml(path)}" alt="${alt}" />`;
  }
  const absolutePath = resolveImagePath(path, env);
  if (env.svgMacro && absolutePath.toLowerCase().endsWith('.svg')) {
    const svg = svgSource(absolutePath);
    if (svg !== null) return diagramMacro(env.svgMacro, svg);
    // Missing file or no <svg> root: fall through to the attachment path so
    // the upload step surfaces the standard "image not found" warning.
  }
  const filename = queueImage(absolutePath, env);
  return `<ac:image ac:alt="${alt}"><ri:attachment ri:filename="${markdownRenderer.utils.escapeHtml(filename)}" /></ac:image>`;
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

// Obsidian callouts (`> [!type] Title`) render as plain blockquotes by
// default; rewrite them into Confluence info/tip/note/warning macros. Runs
// after inline tokenization (core.ruler default order ends with 'inline') so
// each blockquote's first paragraph already has its inline children built.
markdownRenderer.core.ruler.push('obsidian_callouts', state => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue;

    const paraOpen = tokens[i + 1];
    const inline = tokens[i + 2];
    if (paraOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

    // Match against the raw first line: a title with inline markup tokenizes
    // into several children, so the first text child alone would truncate it.
    const newlineIdx = inline.content.indexOf('\n');
    const firstLine = newlineIdx === -1 ? inline.content : inline.content.slice(0, newlineIdx);
    const match = CALLOUT_MARKER_RE.exec(firstLine);
    if (!match) continue;

    const level = tokens[i].level;
    let closeIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === 'blockquote_close' && tokens[j].level === level) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx === -1) continue;

    const macro = calloutMacroName(match[1]);
    const rawTitle = match[3].trim();
    const title = rawTitle
      ? inlineText(rawTitle, state.env)
      : markdownRenderer.utils.escapeHtml(segmentTitle(match[1].toLowerCase()));

    inline.content = newlineIdx === -1 ? '' : inline.content.slice(newlineIdx + 1);
    inline.children = [];
    if (inline.content) state.md.inline.parse(inline.content, state.md, state.env, inline.children);

    tokens[i].meta = { macro, title };
    tokens[closeIdx].meta = { macro, title };
  }
});

// Renders inline markdown down to what Confluence macro parameters accept:
// plain text, HTML-escaped (tags stripped, CDATA wrappers unwrapped).
function inlineText(markdown, env) {
  return markdownRenderer.renderInline(markdown, env ?? {})
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/<[^>]*>/g, '');
}

markdownRenderer.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
  const meta = tokens[idx].meta;
  if (!meta) return self.renderToken(tokens, idx, options);
  return `<ac:structured-macro ac:name="${meta.macro}"><ac:parameter ac:name="title">${meta.title}</ac:parameter><ac:rich-text-body>\n`;
};
markdownRenderer.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
  const meta = tokens[idx].meta;
  if (!meta) return self.renderToken(tokens, idx, options);
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
// so fences compile in this pre-pass and renderCodeToken looks the results up
// by (lang, source). Renders come from the site build's content-hash cache
// when available; a fence that fails to compile maps to null (renderCodeToken
// then falls back to the labeled source block) with a console warning, like
// the site build's visible notice.
async function compileFenceSvgs(markdown, { cacheDir = diagramCacheDir, compilers } = {}) {
  const fenceSvgs = new Map();
  for (const token of markdownRenderer.parse(matter(markdown).content, {})) {
    if (token.type !== 'fence') continue;
    const lang = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
    if (!fenceLanguages.includes(lang)) continue;
    const source = token.content.replace(/\n$/, '');
    const key = fenceKey(lang, source);
    if (fenceSvgs.has(key)) continue;
    try {
      fenceSvgs.set(key, await renderFenceSvg(lang, source, { cacheDir, compilers }));
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0].slice(0, 300);
      console.warn(`Warning: ${lang} fence failed to compile, syncing its source instead: ${reason}`);
      fenceSvgs.set(key, null);
    }
  }
  return fenceSvgs;
}

// context: { filePath, contentDir, notesMap, mermaidMacro, plantumlMacro,
// svgMacro, fenceSvgs }, threaded through markdown-it's per-render `env` so
// every custom rule sees it. filePath/contentDir/notesMap are needed to
// resolve wiki-links and local image paths, fenceSvgs (from compileFenceSvgs)
// to render tikz/typst fences; omit them (as the unit tests do) to render
// markdown in isolation, with wiki-links falling back to a guessed title,
// images to plain <img> tags, and diagram fences to source blocks.
function markdownToStorage(markdown, context = {}) {
  const env = {
    filePath: context.filePath ?? null,
    contentDir: context.contentDir ?? null,
    notesMap: context.notesMap ?? new Map(),
    mermaidMacro: context.mermaidMacro ?? null,
    plantumlMacro: context.plantumlMacro ?? null,
    svgMacro: context.svgMacro ?? null,
    fenceSvgs: context.fenceSvgs ?? null,
    images: [],
    taskId: 0,
  };
  return { html: markdownRenderer.render(markdown, env).trimEnd(), images: env.images };
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

  // Separate from request(): Confluence's attachment endpoints take
  // multipart/form-data, not JSON, and require the X-Atlassian-Token header
  // to bypass XSRF protection on non-JSON writes.
  async requestForm(path, { method = 'POST', formData }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        body: formData,
        signal: controller.signal,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          'X-Atlassian-Token': 'no-check',
        },
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`${method} ${path} timed out after ${this.timeoutMs}ms`);
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
        if (response.ok) throw new Error(`${method} ${path} returned invalid JSON`);
      }
    }
    if (!response.ok) {
      const message = data?.message ?? data?.statusMessage ?? text;
      throw new Error(`${method} ${path} failed: ${response.status} ${message}`);
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

  async findAttachment(pageId, filename) {
    const data = await this.request(`/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?filename=${encodeURIComponent(filename)}`);
    return data.results[0] ?? null;
  }

  async createAttachment(pageId, buffer, filename) {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    const data = await this.requestForm(`/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`, { formData: form });
    return data.results[0];
  }

  updateAttachmentData(pageId, attachmentId, buffer, filename) {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    return this.requestForm(`/rest/api/content/${encodeURIComponent(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/data`, { formData: form });
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

function resolveImageFiles(images, args) {
  const files = [];
  for (const image of images) {
    let stat;
    try {
      stat = statSync(image.absolutePath);
    } catch {
      console.warn(`Warning: image not found, skipping: ${relative(args.contentDir, image.absolutePath)}`);
      continue;
    }
    if (!stat.isFile()) continue;
    files.push(image);
  }
  return files;
}

async function syncAttachments({ client, page, images, args }) {
  for (const image of resolveImageFiles(images, args)) {
    const relPath = relative(args.contentDir, image.absolutePath);
    if (!args.apply) {
      console.log(`[dry-run] upload attachment "${image.filename}" (${relPath}) to ${page.id}`);
      continue;
    }

    const buffer = readFileSync(image.absolutePath);
    const existing = await client.findAttachment(page.id, image.filename);
    if (existing) {
      console.log(`Updating attachment "${image.filename}" on "${page.title}" (${page.id})`);
      await client.updateAttachmentData(page.id, existing.id, buffer, image.filename);
    } else {
      console.log(`Creating attachment "${image.filename}" on "${page.title}" (${page.id})`);
      await client.createAttachment(page.id, buffer, image.filename);
    }
  }
}

async function syncFile({ client, parent, filePath, title, rendered, args }) {
  const { html: body, images } = rendered;
  const existing = isDryPage(parent) ? null : await client.findChild(parent.id, title);
  const relPath = relative(args.contentDir, filePath);

  let page;
  if (!existing) {
    if (!args.apply) {
      console.log(`[dry-run] create page "${title}" under ${parent.id} from ${relPath}`);
      for (const image of resolveImageFiles(images, args)) {
        console.log(`[dry-run] upload attachment "${image.filename}" (${relative(args.contentDir, image.absolutePath)})`);
      }
      return;
    }
    console.log(`Creating page "${title}" from ${relPath}`);
    // Some deployments answer content writes with an empty body, which
    // request() surfaces as null; recover the page id rather than crashing
    // after the write already succeeded.
    page = await client.createPage({ parentId: parent.id, spaceKey: parent.space.key, title, body })
      ?? await client.findChild(parent.id, title);
  } else {
    if (!args.apply) {
      console.log(`[dry-run] update page "${title}" (${existing.id}) from ${relPath}`);
      for (const image of resolveImageFiles(images, args)) {
        console.log(`[dry-run] upload attachment "${image.filename}" (${relative(args.contentDir, image.absolutePath)})`);
      }
      return;
    }
    console.log(`Updating page "${title}" (${existing.id}) from ${relPath}`);
    page = (await client.updatePage({ page: existing, title, body })) ?? existing;
  }

  if (!page) {
    if (images.length > 0) console.warn(`Warning: could not determine the page id for "${title}"; skipping ${images.length} attachment(s).`);
    return;
  }
  await syncAttachments({ client, page, images, args });
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
    const rendered = storageBody(markdown, title, {
      filePath,
      contentDir: args.contentDir,
      notesMap: args.notesMap,
      mermaidMacro: args.mermaidMacro,
      plantumlMacro: args.plantumlMacro,
      svgMacro: args.svgMacro,
      fenceSvgs: await compileFenceSvgs(markdown),
    });
    await syncFile({ client, parent, filePath, title, rendered, args });
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

  args.notesMap = buildNotesMap(args.contentDir);

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

export { buildNotesMap, compileFenceSvgs, markdownToStorage, pageTitle, parseArgs, parseRoots, storageBody };
