// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the lazily-imported mermaid module. `run` records the theme it was
// initialised with at call time so we can assert re-renders pick up the toggle.
const initialize = vi.fn();
const run = vi.fn();
vi.mock('mermaid', () => ({ default: { initialize, run } }));

import { initMermaid } from '../mermaid';

function addDiagram(src: string) {
  const pre = document.createElement('pre');
  pre.className = 'mermaid';
  pre.textContent = src;
  document.body.append(pre);
  return pre;
}

// Track every observer initMermaid creates so each test tears its own down —
// a leaked theme observer would keep firing render() across later tests.
const observers: MutationObserver[] = [];
async function init() {
  const observer = await initMermaid();
  if (observer) observers.push(observer);
  return observer;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  initialize.mockReset();
  run.mockReset();
});

afterEach(() => {
  observers.splice(0).forEach(o => o.disconnect());
  document.documentElement.removeAttribute('data-theme');
});

describe('initMermaid', () => {
  it('does nothing when the page has no mermaid blocks', async () => {
    await init();
    expect(run).not.toHaveBeenCalled();
  });

  it('stashes the source and renders with the light theme by default', async () => {
    const pre = addDiagram('graph TD\n  A --> B');
    await init();

    expect(pre.dataset.src).toBe('graph TD\n  A --> B');
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, theme: 'default' }),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].nodes).toContain(pre);
  });

  it('renders with the dark theme when data-theme is dark', async () => {
    document.documentElement.dataset.theme = 'dark';
    addDiagram('graph TD');
    await init();

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('re-renders from the stashed source when the theme toggle flips', async () => {
    // Simulate mermaid: record the source/marker state at call time (after the
    // pre-run restore), then replace the text with an <svg> like the real lib.
    const seen: { text: string; processed: boolean }[] = [];
    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      for (const n of nodes) {
        seen.push({ text: n.textContent ?? '', processed: n.hasAttribute('data-processed') });
        n.setAttribute('data-processed', 'true');
        n.innerHTML = '<svg>rendered</svg>';
      }
    });

    const pre = addDiagram('graph TD');
    await init();
    expect(run).toHaveBeenCalledTimes(1);

    document.documentElement.dataset.theme = 'dark';
    await new Promise(r => setTimeout(r, 0)); // let the MutationObserver fire

    expect(run).toHaveBeenCalledTimes(2);
    // On the re-render the source was restored and the processed marker cleared
    // before mermaid ran again.
    expect(seen[1]).toEqual({ text: 'graph TD', processed: false });
    expect(initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('shows a fallback notice when a diagram fails to render', async () => {
    // mermaid leaves a node without an <svg> when it can't parse the source.
    run.mockImplementationOnce(async () => {});
    const pre = addDiagram('not a real diagram');
    await init();

    expect(pre.classList.contains('mermaid-error')).toBe(true);
    expect(pre.textContent).toBe('Diagram could not be rendered.');
  });

  it('leaves a successfully-rendered diagram untouched', async () => {
    // Simulate mermaid replacing the source with an <svg>.
    run.mockImplementationOnce(async ({ nodes }: { nodes: HTMLElement[] }) => {
      for (const n of nodes) n.innerHTML = '<svg>ok</svg>';
    });
    const pre = addDiagram('graph TD');
    await init();

    expect(pre.classList.contains('mermaid-error')).toBe(false);
    expect(pre.querySelector('svg')).not.toBeNull();
  });

  it('ignores attribute mutations that do not change the theme', async () => {
    addDiagram('graph TD');
    await init();
    expect(run).toHaveBeenCalledTimes(1);

    document.documentElement.dataset.theme = 'light'; // still resolves to 'default'
    await new Promise(r => setTimeout(r, 0));

    expect(run).toHaveBeenCalledTimes(1);
  });
});
