/** The scaffolding shared by the client-side diagram renderers (mermaid,
 *  plantuml). Both lazily import a heavy engine, turn `<pre class="lang">`
 *  blocks into SVG, and re-render when the light/dark toggle flips
 *  `data-theme` on <html> — only the rendering in the middle differs. */

/** Whether the site is currently in dark mode. */
export function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

/**
 * The page's diagram blocks for `selector`, with each block's source stashed in
 * `data-src` first — rendering replaces the text with SVG, so a later theme
 * switch needs the original to re-render from scratch.
 */
export function collectDiagramBlocks(selector: string): HTMLElement[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const node of nodes) {
    if (node.dataset.src === undefined) node.dataset.src = node.textContent ?? '';
  }
  return nodes;
}

/**
 * Re-run `render` whenever the theme actually changes. `data-theme` is also
 * written on first paint and on same-value sets, so the observer compares
 * against the last theme rather than re-rendering on every mutation.
 */
export function observeThemeChanges(render: () => void | Promise<void>): MutationObserver {
  let last = isDarkTheme();
  const observer = new MutationObserver(() => {
    const dark = isDarkTheme();
    if (dark === last) return;
    last = dark;
    void render();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return observer;
}
