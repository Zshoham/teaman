/** Rewrites ```plantuml fences into a `<pre class="plantuml">` raw-HTML node so
 *  Shiki leaves them alone and the client renderer (`src/scripts/plantuml.ts`)
 *  can turn the definition into SVG in the browser — which keeps the build
 *  browser-free and lets diagrams follow the light/dark toggle. The engine reads
 *  the element's text content, so the source is HTML-escaped, not highlighted. */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function remarkPlantuml() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'code' && child.lang === 'plantuml') {
          node.children[i] = {
            type: 'html',
            value: `<pre class="plantuml">${escapeHtml(child.value)}</pre>`,
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
