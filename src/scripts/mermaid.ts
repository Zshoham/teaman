/** Render Mermaid fences with Pele only on pages that contain diagrams.
 * Colors follow the site's CSS tokens without rebuilding the SVG. */
import { collectDiagramBlocks } from './themed-diagrams';

export async function initMermaid(): Promise<void> {
  const nodes = collectDiagramBlocks('pre.mermaid');
  if (nodes.length === 0) return;

  const { render } = await import('pele');
  await document.fonts?.ready;
  for (const [index, node] of nodes.entries()) {
    node.classList.remove('mermaid-error');
    try {
      const style = getComputedStyle(node);
      const { svg } = render(node.dataset.src ?? '', {
        idPrefix: `mermaid-${index}`,
        fontFamily: style.getPropertyValue('--font-sans').trim() || 'sans-serif',
        fontFamilyMono: style.getPropertyValue('--font-mono').trim() || 'monospace',
      });
      node.innerHTML = svg;
    } catch {
      node.classList.add('mermaid-error');
      node.textContent = 'Diagram could not be rendered.';
    }
    node.dataset.processed = 'true';
  }
}
