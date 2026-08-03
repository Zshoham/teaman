// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  collectDiagramBlocks,
  isDarkTheme,
  observeThemeChanges,
} from '../themed-diagrams';

const observers: MutationObserver[] = [];
function watch(render: () => void) {
  const observer = observeThemeChanges(render);
  observers.push(observer);
  return observer;
}

/** MutationObserver callbacks are microtask-scheduled; let them drain. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function addBlock(className: string, src: string) {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = src;
  document.body.append(pre);
  return pre;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  observers.splice(0).forEach(o => o.disconnect());
  document.documentElement.removeAttribute('data-theme');
});

describe('isDarkTheme', () => {
  it('follows data-theme on the root element', () => {
    expect(isDarkTheme()).toBe(false);
    document.documentElement.dataset.theme = 'dark';
    expect(isDarkTheme()).toBe(true);
    document.documentElement.dataset.theme = 'light';
    expect(isDarkTheme()).toBe(false);
  });
});

describe('collectDiagramBlocks', () => {
  it('returns only the matching blocks', () => {
    addBlock('mermaid', 'graph TD');
    addBlock('plantuml', '@startuml');
    expect(collectDiagramBlocks('pre.mermaid')).toHaveLength(1);
  });

  it('stashes each source in data-src', () => {
    addBlock('mermaid', 'graph TD');
    expect(collectDiagramBlocks('pre.mermaid')[0].dataset.src).toBe('graph TD');
  });

  it('keeps the original source when called again after a render', () => {
    const pre = addBlock('mermaid', 'graph TD');
    collectDiagramBlocks('pre.mermaid');
    pre.innerHTML = '<svg>rendered</svg>';
    // A second pass must not overwrite the stash with the rendered SVG.
    expect(collectDiagramBlocks('pre.mermaid')[0].dataset.src).toBe('graph TD');
  });

  it('returns an empty list on a page with no diagrams', () => {
    expect(collectDiagramBlocks('pre.mermaid')).toEqual([]);
  });
});

describe('observeThemeChanges', () => {
  it('re-renders when the theme flips', async () => {
    const render = vi.fn();
    watch(render);
    document.documentElement.dataset.theme = 'dark';
    await settle();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('ignores a write that leaves the theme unchanged', async () => {
    const render = vi.fn();
    document.documentElement.dataset.theme = 'light';
    watch(render);
    document.documentElement.dataset.theme = 'light';
    await settle();
    expect(render).not.toHaveBeenCalled();
  });

  it('stops re-rendering once disconnected', async () => {
    const render = vi.fn();
    watch(render).disconnect();
    document.documentElement.dataset.theme = 'dark';
    await settle();
    expect(render).not.toHaveBeenCalled();
  });
});
