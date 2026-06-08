/** Renders the `<pre class="plantuml">` blocks emitted by remark-plantuml into
 *  SVG, lazily importing the (multi-megabyte) PlantUML engine only when a page
 *  actually contains a diagram, and re-rendering when the light/dark toggle
 *  flips `data-theme` on <html>. */

// viz-global.js is loaded for its URL, not bundled: importing it as a module
// makes Vite take its UMD CommonJS branch, which populates module exports
// instead of `globalThis.Viz` — leaving `Viz` undefined and silently breaking
// every Graphviz-laid-out diagram (state, component, activity…). Loading it as
// a classic <script> forces the UMD browser branch, which installs the engine
// on `globalThis.Viz` the way @plantuml/core expects.
import vizUrl from '@plantuml/core/viz-global.js?url';

// Safety net: if a render neither succeeds nor calls onError (e.g. the engine
// throws inside its async worker), fall back to the error notice instead of
// leaving the block hidden forever.
const RENDER_TIMEOUT_MS = 15000;

function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

/** Loads viz-global.js (the Graphviz layout engine) as a classic script so its
 *  UMD wrapper installs `globalThis.Viz`. Memoised: at most one script tag. */
let vizPromise: Promise<void> | undefined;
function loadViz(): Promise<void> {
  if ('Viz' in globalThis) return Promise.resolve();
  if (vizPromise) return vizPromise;
  vizPromise = new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error('failed to load viz-global.js'));
    const script = document.createElement('script');
    script.src = vizUrl;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', fail);
    try {
      document.head.append(script);
    } catch {
      fail();
    }
  });
  return vizPromise;
}

/** Renders the page's plantuml blocks. Returns the theme-watching observer (or
 *  `undefined` when the page has no diagrams) so callers can dispose it. */
export async function initPlantuml(): Promise<MutationObserver | undefined> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('pre.plantuml'),
  );
  if (nodes.length === 0) return;

  // Stash each diagram's source before we replace the text with SVG, so a later
  // theme switch can restore it and re-render from scratch.
  for (const node of nodes) {
    if (node.dataset.src === undefined) node.dataset.src = node.textContent ?? '';
  }

  // A diagram we can't render gets a readable notice so a malformed definition
  // (or a load failure) fails visibly, not silently.
  const showError = (node: HTMLElement) => {
    node.classList.add('plantuml-error');
    node.removeAttribute('data-processed');
    node.textContent = 'Diagram could not be rendered.';
  };

  let renderToString: (
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
    options?: { dark?: boolean },
  ) => void;
  try {
    await loadViz();
    ({ renderToString } = await import('@plantuml/core'));
  } catch {
    for (const node of nodes) showError(node);
    return;
  }

  // renderToString delivers the SVG via callback. The engine keeps shared
  // internal state across calls, so we render one diagram at a time.
  const renderOne = (src: string, dark: boolean) =>
    new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (svg: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(svg);
      };
      const timer = setTimeout(() => finish(null), RENDER_TIMEOUT_MS);
      const lines = src.split(/\r\n|\r|\n/);
      try {
        renderToString(
          lines,
          (svg: string) => finish(svg || null),
          () => finish(null),
          { dark },
        );
      } catch {
        finish(null);
      }
    });

  const render = async () => {
    const dark = isDark();
    for (const node of nodes) {
      const svg = await renderOne(node.dataset.src ?? '', dark);
      if (svg) {
        node.classList.remove('plantuml-error');
        node.innerHTML = svg;
        node.setAttribute('data-processed', 'true');
      } else {
        showError(node);
      }
    }
  };

  await render();

  let last = isDark();
  const observer = new MutationObserver(() => {
    const dark = isDark();
    if (dark !== last) {
      last = dark;
      void render();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return observer;
}
