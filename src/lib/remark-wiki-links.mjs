/**
 * Obsidian wiki-links and embeds on the site, resolved against the vault index
 * (see `vault-index.mjs`).
 *
 * `remarkWikiLinks` points each `[[wiki-link]]` at the page the site renders
 * for it. `remark-wiki-link` still does the parsing — it runs first and leaves
 * `wikiLink` nodes — but its resolver only sees the link text, never the file
 * the link is written in, so it cannot apply Obsidian's same-folder
 * preference. This pass re-resolves every node with `file.path` in hand. An
 * unresolved link renders as `<span class="wiki-link-missing">`: no dead href.
 * `teaman doctor` reports it (and ambiguous, heading, and slug-fallback
 * links); the build itself stays quiet.
 *
 * `remarkWikiEmbeds` handles `![[embed]]`, which the parser leaves as text. An
 * image embed becomes an ordinary image of the attachment Obsidian would find
 * (so remark-inline-svg and Astro's image pipeline treat it like any other); a
 * note embed fails the build — the site does not transclude notes.
 */
import { dirname, relative } from 'path';
import { cachedVaultIndex } from './vault-index.mjs';
import { replaceChildren } from './mdast-walk.mjs';
import { isImageEmbed } from './obsidian-markdown.mjs';

const indexes = new Map();

/** One cached index per vault and base, shared by both passes. */
function vaultIndexFor(vaultDir, base) {
  const key = `${vaultDir}\0${base}`;
  if (!indexes.has(key)) indexes.set(key, cachedVaultIndex(vaultDir, { base }));
  return indexes.get(key)();
}

/** @param {{ vaultDir: string, base: string }} options */
export function remarkWikiLinks({ vaultDir, base }) {
  return (tree, file) => {
    replaceChildren(tree, node => {
      if (node.type !== 'wikiLink') return undefined;
      const resolution = vaultIndexFor(vaultDir, base).resolve(node.value, file?.path);
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
  };
}

const EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;
const SIZE_RE = /^(\d+)(?:x(\d+))?$/;

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
 * `![[target|label]]` as an mdast image. Obsidian reads a numeric label as a
 * size (`|300`, `|300x200`); anything else is the alt text.
 */
function embedImage(target, label, file, node, vaultDir, base) {
  const found = vaultIndexFor(vaultDir, base).resolveAttachment(target, file?.path);
  if (!found) fail(file, `![[${target}]]: no image named “${target}” in the vault`, node);
  const from = file?.path ? dirname(file.path) : vaultDir;
  const rel = relative(from, found).split('\\').join('/');
  const url = rel.startsWith('.') ? rel : `./${rel}`;
  const size = label ? SIZE_RE.exec(label) : null;
  return {
    type: 'image',
    url,
    alt: size ? '' : label ?? '',
    ...(size ? { data: { hProperties: { width: size[1], ...(size[2] ? { height: size[2] } : {}) } } } : {}),
  };
}

/** @param {{ vaultDir: string, base: string }} options */
export function remarkWikiEmbeds({ vaultDir, base }) {
  return (tree, file) => {
    const visit = parent => {
      if (!Array.isArray(parent.children)) return;
      parent.children = parent.children.flatMap(node => {
        if (node.type !== 'text') {
          visit(node);
          return [node];
        }
        if (!node.value.includes('![[')) return [node];
        const out = [];
        let last = 0;
        for (const match of node.value.matchAll(EMBED_RE)) {
          const [whole, inner] = match;
          const pipe = inner.indexOf('|');
          const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
          const label = pipe === -1 ? undefined : inner.slice(pipe + 1).trim();
          if (!isImageEmbed(target)) {
            fail(file, `![[${target}]] embeds a note, which teaman does not support — link it with [[${target}]] instead`, node);
          }
          if (match.index > last) out.push({ type: 'text', value: node.value.slice(last, match.index) });
          out.push(embedImage(target, label, file, node, vaultDir, base));
          last = match.index + whole.length;
        }
        if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
        return out;
      });
    };
    visit(tree);
  };
}
