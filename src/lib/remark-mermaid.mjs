/** Rewrites ```mermaid fences into a `<pre class="mermaid">` raw-HTML node so
 *  Shiki leaves them alone and the client renderer (`src/scripts/mermaid.ts`)
 *  can turn the definition into SVG in the browser — which keeps the build
 *  browser-free and lets diagrams follow the light/dark toggle. Mermaid reads
 *  the element's text content, so the source is HTML-escaped, not highlighted. */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function remarkMermaid() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'code' && child.lang === 'mermaid') {
          node.children[i] = {
            type: 'html',
            value: `<pre class="mermaid">${escapeHtml(child.value)}</pre>`,
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
