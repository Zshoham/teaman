/**
 * Interactive HTML embeds: `![[visualization.html]]`.
 *
 * A self-contained `.html` file anywhere in the vault — found the way Obsidian
 * finds any attachment — renders as a sandboxed <iframe>. The frame is what
 * makes "complex HTML" safe to drop into a page: the embed brings its own CSS
 * and JS, neither can leak into the site (or the site's into it), and with
 * `allow-scripts` but no `allow-same-origin` it cannot reach the page's DOM,
 * storage, or cookies. The same file embeds unchanged in a Slidev deck (see
 * `resources/slidev-theme-teaman/setup/transformers.ts`).
 *
 * Every embed is served from one URL shape, `<base>embeds/<vault path>`:
 * `htmlEmbeds()` serves the vault file there under `astro dev` and copies each
 * file a built page references into the out dir.
 *
 * The page and the frame talk over `postMessage` (`src/scripts/html-embeds.ts`
 * on the site, the theme's `HtmlEmbed.vue` in decks):
 * - page → embed `{ type: 'teaman:theme', theme: 'light' | 'dark' }`, on load,
 *   when the embed says `{ type: 'teaman:ready' }`, and on every toggle;
 * - embed → page `{ type: 'teaman:resize', height }` sizes the frame to its
 *   content, unless the author fixed a height (`![[viz.html|600]]`).
 * An embed that ignores both still works: it just picks its own colors and
 * scrolls inside the default height.
 */
import { createReadStream, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { isAttachmentPath } from './fs-walk.mjs';

/** The out-dir folder (and URL segment) embeds are served from. */
export const EMBEDS_DIR = 'embeds';

/** Height of a frame whose author gave none and whose embed never reports one. */
export const DEFAULT_EMBED_HEIGHT = 480;

/** Scripts and outbound links (target=_blank) only: no same-origin access. */
export const EMBED_SANDBOX = 'allow-scripts allow-popups';

const SIZE_RE = /^(?:(\d+)x)?(\d+)$/;

const isHtmlFile = path => /\.html?$/i.test(path);

/** Whether an `![[embed]]` target is a self-contained HTML page. */
export function isHtmlEmbed(target) {
  return isHtmlFile(target.split(/[?#]/, 1)[0]);
}

/** `solar-system.html` → `Solar system`: a frame needs an accessible name. */
function titleFromFile(path) {
  const words = basename(path, extname(path)).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Everything `![[target|label]]` says about one HTML embed, for the site and
 * for decks alike:
 * - `path`: the target as written, minus any `?query`/`#fragment` and a
 *   leading `./` or `/` — what is looked up in the vault, and where a deck
 *   stages the file under its public `embeds/` dir;
 * - `suffix`: that `?query`/`#fragment`, which rides along to the embed;
 * - the label: Obsidian reads a numeric label as a size; for a frame that
 *   always fills the column, a lone number is its `height` (`|600`), and
 *   `|800x600` also sets the `width`. Anything else is the `caption`.
 * - `title`: the caption, or a name made from the file name.
 *
 * @param {string} target
 * @param {string} [label]
 * @returns {{ path: string, suffix: string, title: string, caption?: string, width?: number, height?: number }}
 */
export function parseHtmlEmbed(target, label) {
  const trimmed = target.trim();
  const cut = trimmed.search(/[?#]/);
  const path = (cut === -1 ? trimmed : trimmed.slice(0, cut)).trim().replace(/^(\.\/|\/)+/, '');
  const text = label?.trim();
  const size = text ? SIZE_RE.exec(text) : null;
  const caption = text && !size ? text : undefined;
  return {
    path,
    suffix: cut === -1 ? '' : trimmed.slice(cut),
    title: caption ?? titleFromFile(path),
    ...(caption ? { caption } : {}),
    ...(size?.[1] ? { width: Number(size[1]) } : {}),
    ...(size ? { height: Number(size[2]) } : {}),
  };
}

/**
 * The site URL of an embed, from its vault-relative path.
 *
 * @param {string} base  normalized site base
 * @param {string} relPath  vault-relative, `/`-separated
 */
export function htmlEmbedHref(base, relPath) {
  return `${base}${EMBEDS_DIR}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The hast for one embed: a `<figure>` when it stands alone in its paragraph
 * (with the label as caption, like a standalone image), a `<span>` when it
 * flows inside text so no block ends up inside a `<p>`.
 *
 * @param {{ src: string, target: string, label?: string, block?: boolean }} embed
 */
export function htmlEmbedElement({ src, target, label, block = false }) {
  const { title, caption, width, height } = parseHtmlEmbed(target, label);
  const iframe = {
    type: 'element',
    tagName: 'iframe',
    properties: {
      src,
      title,
      loading: 'lazy',
      sandbox: EMBED_SANDBOX,
      allow: 'fullscreen',
      height: String(height ?? DEFAULT_EMBED_HEIGHT),
      ...(width ? { width: String(width) } : {}),
      // An author-set height wins over the embed's own resize requests.
      ...(height ? { dataFixedHeight: true } : {}),
    },
    children: [],
  };
  const figcaption = block && caption
    ? [{ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: caption }] }]
    : [];
  return {
    type: 'element',
    tagName: block ? 'figure' : 'span',
    properties: { className: ['html-embed'] },
    children: [iframe, ...figcaption],
  };
}

/** The vault file behind an `embeds/…` URL path, or null if it is not one. */
function embedFile(vaultDir, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // join() normalizes `..`; anything that escapes the vault, is not a vault
  // attachment (the rule `![[…]]` resolves by), or is not HTML is not an embed.
  // `rel` is already a file path: a `#` or `?` in it is part of a name.
  const file = join(vaultDir, rel);
  if (!file.startsWith(vaultDir + sep) || !isHtmlFile(file)) return null;
  if (!isAttachmentPath(relative(vaultDir, file))) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

function* htmlFiles(dir, skip) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== skip) yield* htmlFiles(path, skip);
    } else if (entry.name.endsWith('.html')) {
      yield path;
    }
  }
}

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Astro integration serving `<base>embeds/<vault path>` on every entry point
 * of the env seam. Under `astro dev` the vault file is served directly; after
 * `astro build` the built pages are scanned for embed frames and each file
 * they name is copied into the out dir. Scanning the output rather than
 * recording renders keeps the copy right even when Astro served an entry from
 * its content cache without re-rendering it.
 *
 * @param {{ vaultDir: string, base: string }} options
 */
export function htmlEmbeds({ vaultDir, base }) {
  const prefix = `${base}${EMBEDS_DIR}/`;

  return {
    name: 'teaman:html-embeds',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split(/[?#]/, 1)[0];
          if (!url.startsWith(prefix)) return next();
          const file = embedFile(vaultDir, url.slice(prefix.length));
          if (!file) return next();
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': ({ dir }) => {
        const out = fileURLToPath(dir);
        const target = join(out, EMBEDS_DIR);
        // htmlEmbedHref percent-encodes every segment, so the attribute
        // value never carries an entity to undo.
        const src = new RegExp(`src="${escapeRe(prefix)}([^"?#]+)`, 'g');
        const wanted = new Set();
        for (const page of htmlFiles(out, target)) {
          for (const [, urlPath] of readFileSync(page, 'utf8').matchAll(src)) wanted.add(urlPath);
        }
        for (const urlPath of wanted) {
          const file = embedFile(vaultDir, urlPath);
          if (!file) continue;
          const dest = join(target, relative(vaultDir, file));
          mkdirSync(dirname(dest), { recursive: true });
          cpSync(file, dest);
        }
      },
    },
  };
}
