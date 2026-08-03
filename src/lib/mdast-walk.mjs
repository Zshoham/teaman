/**
 * The one traversal the engine's remark plugins need: walk a tree and swap
 * nodes out for raw HTML. Each plugin used to hand-roll this loop.
 */

/**
 * Depth-first walk of `tree`'s children, offering each to `visit`.
 *
 * `visit(node, parent, index)` returns:
 * - a node — replace `node` with it, and do not descend into it;
 * - `null` — leave `node` alone and do not descend (it was handled, or is a
 *   dead end the plugin has already decided about);
 * - `undefined` — not this plugin's node: descend into it.
 *
 * @param {{ children?: unknown[] }} tree
 * @param {(node: any, parent: any, index: number) => any} visit
 */
export function replaceChildren(tree, visit) {
  const walk = (node) => {
    if (!node || !Array.isArray(node.children)) return;
    for (let index = 0; index < node.children.length; index++) {
      const child = node.children[index];
      const replacement = visit(child, node, index);
      if (replacement === undefined) walk(child);
      else if (replacement !== null) node.children[index] = replacement;
    }
  };
  walk(tree);
}
