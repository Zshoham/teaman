/** Rewrites a diagram fence into a `<pre class="<lang>">` raw-HTML node so Shiki
 *  leaves it alone and the matching client renderer (`src/scripts/<lang>.ts`)
 *  can turn the definition into SVG in the browser — which keeps the build
 *  browser-free and lets diagrams follow the light/dark toggle. The renderers
 *  read the element's text content, so the source is HTML-escaped, not
 *  highlighted.
 *
 *  Contrast `remark-fence-svg.mjs`, which compiles ```tikz / ```typst at build
 *  time because those need a TeX engine and a Typst compiler respectively —
 *  far too heavy to ship to the browser. */
import { escapeHtml } from './html-escape.mjs';
import { replaceChildren } from './mdast-walk.mjs';

/**
 * @param {string} lang  fence language, which is also the `<pre>` class and the
 *   name of the client renderer that picks it up.
 */
export function remarkFencePre(lang) {
  return () => (tree) => {
    replaceChildren(tree, (node) =>
      node.type === 'code' && node.lang === lang
        ? { type: 'html', value: `<pre class="${lang}">${escapeHtml(node.value)}</pre>` }
        : undefined,
    );
  };
}

export const remarkMermaid = remarkFencePre('mermaid');
export const remarkPlantuml = remarkFencePre('plantuml');
