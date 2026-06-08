// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// viz-global.js is imported only for its asset URL (the real file is loaded as
// a classic <script> at runtime); the tests pre-set `globalThis.Viz` so
// loadViz() short-circuits and never injects a script.
vi.mock('@plantuml/core/viz-global.js?url', () => ({ default: '/viz-global.js' }));

// Mock the lazily-imported engine. `renderToString` records the dark flag it
// was called with so we can assert re-renders pick up the theme toggle, then
// delivers an <svg> string via the success callback (or fails via onError).
const renderToString = vi.fn();
vi.mock('@plantuml/core', () => ({ renderToString }));

import { initPlantuml } from '../plantuml';

// Default behaviour: succeed, echoing the dark flag into the rendered SVG.
function succeedWithSvg() {
  renderToString.mockImplementation(
    (_lines: string[], onSuccess: (svg: string) => void, _onError, opts) => {
      onSuccess(`<svg data-dark="${opts?.dark ? 'true' : 'false'}">ok</svg>`);
    },
  );
}

function addDiagram(src: string) {
  const pre = document.createElement('pre');
  pre.className = 'plantuml';
  pre.textContent = src;
  document.body.append(pre);
  return pre;
}

// Track every observer initPlantuml creates so each test tears its own down —
// a leaked theme observer would keep firing render() across later tests.
const observers: MutationObserver[] = [];
async function init() {
  const observer = await initPlantuml();
  if (observer) observers.push(observer);
  return observer;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  // Pretend viz-global.js has already installed the Graphviz engine so
  // loadViz() resolves without injecting a <script> the test env can't run.
  (globalThis as any).Viz = {};
  renderToString.mockReset();
  succeedWithSvg();
});

afterEach(() => {
  observers.splice(0).forEach(o => o.disconnect());
  document.documentElement.removeAttribute('data-theme');
  delete (globalThis as any).Viz;
});

describe('initPlantuml', () => {
  it('does nothing when the page has no plantuml blocks', async () => {
    await init();
    expect(renderToString).not.toHaveBeenCalled();
  });

  it('stashes the source and renders the SVG in light mode by default', async () => {
    const pre = addDiagram('@startuml\nA -> B\n@enduml');
    await init();

    expect(pre.dataset.src).toBe('@startuml\nA -> B\n@enduml');
    expect(renderToString).toHaveBeenCalledTimes(1);
    // Source is split into lines for the engine.
    expect(renderToString.mock.calls[0][0]).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(pre.querySelector('svg')?.getAttribute('data-dark')).toBe('false');
    expect(pre.hasAttribute('data-processed')).toBe(true);
  });

  it('renders in dark mode when data-theme is dark', async () => {
    document.documentElement.dataset.theme = 'dark';
    const pre = addDiagram('@startuml\n@enduml');
    await init();

    expect(renderToString.mock.calls[0][3]).toMatchObject({ dark: true });
    expect(pre.querySelector('svg')?.getAttribute('data-dark')).toBe('true');
  });

  it('re-renders from the stashed source when the theme toggle flips', async () => {
    const pre = addDiagram('@startuml\n@enduml');
    await init();
    expect(renderToString).toHaveBeenCalledTimes(1);

    document.documentElement.dataset.theme = 'dark';
    await new Promise(r => setTimeout(r, 0)); // let the MutationObserver fire

    expect(renderToString).toHaveBeenCalledTimes(2);
    // The re-render restored the original source and switched to dark mode.
    expect(renderToString.mock.calls[1][0]).toEqual(['@startuml', '@enduml']);
    expect(renderToString.mock.calls[1][3]).toMatchObject({ dark: true });
    expect(pre.querySelector('svg')?.getAttribute('data-dark')).toBe('true');
  });

  it('shows a fallback notice when a diagram fails to render', async () => {
    renderToString.mockImplementation(
      (_lines: string[], _onSuccess, onError: (msg: string) => void) => {
        onError('boom');
      },
    );
    const pre = addDiagram('not a real diagram');
    await init();

    expect(pre.classList.contains('plantuml-error')).toBe(true);
    expect(pre.hasAttribute('data-processed')).toBe(false);
    expect(pre.textContent).toBe('Diagram could not be rendered.');
  });

  it('shows the fallback when a render hangs (neither callback fires)', async () => {
    vi.useFakeTimers();
    try {
      // The Graphviz failure the user hit: the engine never calls onSuccess or
      // onError, so without the timeout the block would stay hidden forever.
      renderToString.mockImplementation(() => {});
      const pre = addDiagram('@startuml\n[*] --> A\n@enduml');
      const done = init();

      await vi.advanceTimersByTimeAsync(15000);
      await done;

      expect(pre.classList.contains('plantuml-error')).toBe(true);
      expect(pre.hasAttribute('data-processed')).toBe(false);
      expect(pre.textContent).toBe('Diagram could not be rendered.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the fallback for every block when viz-global fails to load', async () => {
    // With Viz absent, loadViz() injects a <script>; if that load fails, every
    // block falls back and no render is attempted. (Stub the injection so the
    // failure is deterministic and we don't depend on the test DOM's loader.)
    delete (globalThis as any).Viz;
    const append = vi.spyOn(document.head, 'append').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const a = addDiagram('@startuml\n[*] --> A\n@enduml');
      const b = addDiagram('@startuml\n[*] --> B\n@enduml');
      await init();

      for (const pre of [a, b]) {
        expect(pre.classList.contains('plantuml-error')).toBe(true);
        expect(pre.textContent).toBe('Diagram could not be rendered.');
      }
      expect(renderToString).not.toHaveBeenCalled();
    } finally {
      append.mockRestore();
    }
  });

  it('shows the fallback when the engine throws synchronously', async () => {
    renderToString.mockImplementation(() => { throw new Error('boom'); });
    const pre = addDiagram('@startuml\n@enduml');
    await init();

    expect(pre.classList.contains('plantuml-error')).toBe(true);
    expect(pre.textContent).toBe('Diagram could not be rendered.');
  });

  it('renders each diagram one at a time (serialized)', async () => {
    // The engine keeps shared state, so renders must not overlap. Defer each
    // success callback and assert the next render only starts once the previous
    // one has resolved.
    const pending: Array<() => void> = [];
    renderToString.mockImplementation(
      (_lines: string[], onSuccess: (svg: string) => void) => {
        pending.push(() => onSuccess('<svg>ok</svg>'));
      },
    );

    addDiagram('@startuml\nA\n@enduml');
    addDiagram('@startuml\nB\n@enduml');
    const done = init();

    await new Promise(r => setTimeout(r, 0));
    expect(renderToString).toHaveBeenCalledTimes(1); // second is still waiting
    pending.shift()!();
    await new Promise(r => setTimeout(r, 0));
    expect(renderToString).toHaveBeenCalledTimes(2);
    pending.shift()!();
    await done;
  });

  it('ignores attribute mutations that do not change the theme', async () => {
    addDiagram('@startuml\n@enduml');
    await init();
    expect(renderToString).toHaveBeenCalledTimes(1);

    document.documentElement.dataset.theme = 'light'; // still resolves to light
    await new Promise(r => setTimeout(r, 0));

    expect(renderToString).toHaveBeenCalledTimes(1);
  });
});
