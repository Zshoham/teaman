/**
 * Points each `[[wiki-link]]` at the page the site renders for it, using the
 * vault index's Obsidian-style resolution (see `vault-index.mjs`).
 *
 * `remark-wiki-link` still does the parsing — it runs first and leaves
 * `wikiLink` nodes — but its resolver only sees the link text, never the file
 * the link is written in, so it cannot apply Obsidian's same-folder
 * preference. This pass re-resolves every node with `file.path` in hand.
 *
 * An unresolved link renders as `<span class="wiki-link-missing">`: no dead
 * href. `teaman doctor` reports it (and ambiguous, heading, and slug-fallback
 * links); the build itself stays quiet.
 */
import { createVaultIndex } from './vault-index.mjs';
import { replaceChildren } from './mdast-walk.mjs';

/**
 * @param {{ vaultDir: string, base: string, maxAgeMs?: number }} options
 *   `maxAgeMs` bounds how stale the index may be. A build renders every file
 *   in a burst and a dev save re-renders one, so a short age keeps both cheap
 *   and still picks up notes added while `teaman dev` runs.
 */
export function remarkWikiLinks({ vaultDir, base, maxAgeMs = 2000 }) {
  let index = null;
  let builtAt = 0;
  const currentIndex = () => {
    if (!index || Date.now() - builtAt > maxAgeMs) {
      index = createVaultIndex(vaultDir, { base });
      builtAt = Date.now();
    }
    return index;
  };

  return (tree, file) => {
    replaceChildren(tree, node => {
      if (node.type !== 'wikiLink') return undefined;
      const resolution = currentIndex().resolve(node.value, file?.path);
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
