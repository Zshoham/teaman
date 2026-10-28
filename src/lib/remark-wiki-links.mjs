/**
 * Obsidian wiki-links and embeds on the site, resolved against the vault index
 * (see `vault-index.mjs`).
 *
 * `remarkWikiLinks` points each `[[wiki-link]]` at the page the site renders
 * for it. `remark-wiki-link` still does the parsing — it runs first and leaves
 * `wikiLink` nodes — but its resolver only sees the link text, never the file
 * the link is written in, so it cannot apply Obsidian's same-folder
 * preference. This pass re-resolves every node with the file it was written
 * in — a reference book's chapter, not its SUMMARY.md (`forEachSourceNode`). An
 * unresolved link renders as `<span class="wiki-link-missing">`: no dead href.
 * `teaman doctor` reports it (and ambiguous, heading, and slug-fallback
 * links); the build itself stays quiet.
 *
 * `remarkWikiEmbeds` handles `![[embed]]`, which the parser leaves as text. An
 * image embed becomes an ordinary image of the attachment Obsidian would find
 * (so remark-inline-svg and Astro's image pipeline treat it like any other); an
 * `.html` embed becomes a sandboxed frame (see `html-embeds.mjs`); a note
 * embed fails the build — the site does not transclude notes.
 */
import { dirname, relative } from 'path';
import { cachedVaultIndex } from './vault-index.mjs';
import { replaceChildren } from './mdast-walk.mjs';
import { forEachSourceNode } from './remark-reference-books.mjs';
import { EMBED_RE, resolveEmbed, splitWikiTarget } from './embeds.mjs';
import { htmlEmbedElement, htmlEmbedHref } from './html-embeds.mjs';

const indexes = new Map();

/** One cached index per vault and base, shared by both passes. */
function vaultIndexFor(vaultDir, base) {
  const key = `${vaultDir}\0${base}`;
  if (!indexes.has(key)) indexes.set(key, cachedVaultIndex(vaultDir, { base }));
  return indexes.get(key)();
}

/** @param {{ vaultDir: string, base: string }} options */
export function remarkWikiLinks({ vaultDir, base }) {
  return (tree, file) => forEachSourceNode(tree, file, (top, sourcePath) => {
    replaceChildren({ children: [top] }, node => {
      if (node.type !== 'wikiLink') return undefined;
      const resolution = vaultIndexFor(vaultDir, base).resolve(node.value, sourcePath);
      const label = node.data?.alias ?? node.value;
      node.data = {
        ...node.data,
        hName: resolution ? 'a' : 'span',
        hProperties: resolution
          ? { className: ['internal'], href: resolution.href }
          : { className: ['wiki-link-missing'], title: `No page named “${node.value}”` },
        hChildren: [{ type: 'text', value: label }],
      };
      return null;
    });
  });
}

// Astro's content loaders catch a render error, log it, and carry on — the
// entry just renders empty — so throwing alone cannot fail a build. Each
// failure is also recorded here, and `failOnEmbedErrors` (an integration in
// astro.config.mjs) fails the build once content has synced.
const failures = new Set();

function fail(file, message, node) {
  failures.add(`${file?.path ?? 'markdown'}: ${message}`);
  if (file?.fail) file.fail(message, node);
  throw new Error(message);
}

/** Astro integration: fail `astro build` if any file had a bad embed. */
export function failOnEmbedErrors() {
  return {
    name: 'teaman-embed-errors',
    hooks: {
      'astro:build:start': () => {
        if (failures.size === 0) return;
        throw new Error(`Unsupported or missing embeds:\n${[...failures].map(line => `  ${line}`).join('\n')}`);
      },
    },
  };
}

/**
 * An image embed (`embeds.mjs`) as an mdast image of its file, by a URL
 * relative to the file being rendered, which is what Astro resolves it
 * against.
 */
function embedImage(embed, file, vaultDir) {
  const from = file?.path ? dirname(file.path) : vaultDir;
  const rel = relative(from, embed.file).split('\\').join('/');
  const { caption, width, height } = embed;
  return {
    type: 'image',
    url: rel.startsWith('.') ? rel : `./${rel}`,
    alt: caption ?? '',
    ...(width || height ? {
      data: { hProperties: { ...(width ? { width: String(width) } : {}), ...(height ? { height: String(height) } : {}) } },
    } : {}),
  };
}

/**
 * An HTML embed as an mdast node carrying its frame's hast. It starts inline;
 * `remarkWikiEmbeds` promotes it to a figure when it is alone in its
 * paragraph.
 */
function embedHtml(embed, vaultDir, base) {
  const relPath = relative(vaultDir, embed.file).split('\\').join('/');
  // `![[viz.html#planet=mars]]`: a query or fragment rides along to the embed.
  const src = htmlEmbedHref(base, relPath) + embed.suffix;
  return { type: 'htmlEmbed', embed, src, data: hastData(htmlEmbedElement(embed, { src })) };
}

const hastData = element => ({
  hName: element.tagName,
  hProperties: element.properties,
  hChildren: element.children,
});

const isBlank = node => node.type === 'text' && node.value.trim() === '';

/** @param {{ vaultDir: string, base: string }} options */
export function remarkWikiEmbeds({ vaultDir, base }) {
  return (tree, file) => {
    const visit = (parent, sourcePath) => {
      if (!Array.isArray(parent.children)) return;
      parent.children = parent.children.flatMap(node => {
        if (node.type !== 'text') {
          visit(node, sourcePath);
          return [node];
        }
        if (!node.value.includes('![[')) return [node];
        const out = [];
        let last = 0;
        for (const match of node.value.matchAll(EMBED_RE)) {
          const [whole, inner] = match;
          const { target, label } = splitWikiTarget(inner);
          const { resolveAttachment } = vaultIndexFor(vaultDir, base);
          const embed = resolveEmbed(target, label, { resolveAttachment, fromFile: sourcePath });
          if (embed.problem) fail(file, embed.problem, node);
          if (match.index > last) out.push({ type: 'text', value: node.value.slice(last, match.index) });
          out.push(embed.kind === 'html' ? embedHtml(embed, vaultDir, base) : embedImage(embed, file, vaultDir));
          last = match.index + whole.length;
        }
        if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
        return out;
      });
    };
    forEachSourceNode(tree, file, (top, sourcePath) => visit(top, sourcePath));

    // A paragraph that is exactly one HTML embed is a block figure.
    replaceChildren(tree, node => {
      if (node.type !== 'paragraph') return undefined;
      const content = node.children.filter(child => !isBlank(child));
      if (content.length !== 1 || content[0].type !== 'htmlEmbed') return null;
      const { embed, src } = content[0];
      return { type: 'htmlEmbed', embed, src, data: hastData(htmlEmbedElement(embed, { src, block: true })) };
    });
  };
}
