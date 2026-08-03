/** Renders the `<pre class="mermaid">` blocks emitted by remark-mermaid into
 *  SVG, lazily importing mermaid only when a page actually contains a diagram,
 *  and re-rendering when the light/dark toggle flips `data-theme` on <html>. */

import {
  collectDiagramBlocks,
  isDarkTheme,
  observeThemeChanges,
} from './themed-diagrams';

function currentTheme(): 'dark' | 'default' {
  return isDarkTheme() ? 'dark' : 'default';
}

/** Renders the page's mermaid blocks. Returns the theme-watching observer (or
 *  `undefined` when the page has no diagrams) so callers can dispose it. */
export async function initMermaid(): Promise<MutationObserver | undefined> {
  const nodes = collectDiagramBlocks('pre.mermaid');
  if (nodes.length === 0) return;

  const { default: mermaid } = await import('mermaid');

  const render = async () => {
    for (const node of nodes) {
      node.removeAttribute('data-processed');
      node.classList.remove('mermaid-error');
      node.textContent = node.dataset.src ?? '';
    }
    mermaid.initialize({
      startOnLoad: false,
      theme: currentTheme(),
      securityLevel: 'strict',
      fontFamily: 'inherit',
      // Don't draw mermaid's default error graphic; we detect failures below
      // and substitute our own notice. (Keeps the raw source out of the page.)
      suppressErrorRendering: true,
    });
    // suppressErrors lets the batch finish (and our post-check run) even if one
    // diagram fails to parse, instead of throwing on the first bad one.
    await mermaid.run({ nodes, suppressErrors: true });

    // A node mermaid couldn't render is left showing its raw source; replace it
    // with a readable notice so a malformed diagram fails visibly, not silently.
    for (const node of nodes) {
      if (!node.querySelector('svg')) {
        node.classList.add('mermaid-error');
        node.textContent = 'Diagram could not be rendered.';
      }
    }
  };

  await render();
  return observeThemeChanges(render);
}
