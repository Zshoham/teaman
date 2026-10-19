// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { render } = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('pele', () => ({ render }));
import { initMermaid } from '../mermaid';

function addDiagram(source: string) {
  const pre = document.createElement('pre');
  pre.className = 'mermaid';
  pre.textContent = source;
  document.body.append(pre);
  return pre;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  render.mockReset().mockReturnValue({ svg: '<svg class="pele">ok</svg>' });
});

describe('initMermaid', () => {
  it('does nothing on pages without diagrams', async () => {
    await initMermaid();
    expect(render).not.toHaveBeenCalled();
  });

  it('preserves the source and reveals rendered SVG with distinct IDs', async () => {
    const first = addDiagram('graph TD\nA --> B');
    addDiagram('sequenceDiagram\nA->>B: Hello');
    await initMermaid();
    expect(first.dataset.src).toBe('graph TD\nA --> B');
    expect(first.dataset.processed).toBe('true');
    expect(first.querySelector('svg')).not.toBeNull();
    expect(render.mock.calls[0][1].idPrefix).not.toBe(render.mock.calls[1][1].idPrefix);
  });

  it('keeps the SVG intact when the theme changes', async () => {
    const pre = addDiagram('graph TD\nA --> B');
    await initMermaid();
    const svg = pre.querySelector('svg');
    document.documentElement.dataset.theme = 'dark';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(render).toHaveBeenCalledTimes(1);
    expect(pre.querySelector('svg')).toBe(svg);
  });

  it('reveals an error notice and continues rendering other diagrams', async () => {
    render.mockImplementationOnce(() => { throw new Error('Invalid syntax'); });
    const bad = addDiagram('invalid');
    const good = addDiagram('graph TD\nA --> B');
    await initMermaid();
    expect(bad.textContent).toBe('Diagram could not be rendered.');
    expect(bad.classList.contains('mermaid-error')).toBe(true);
    expect(bad.dataset.processed).toBe('true');
    expect(good.querySelector('svg')).not.toBeNull();
  });
});
