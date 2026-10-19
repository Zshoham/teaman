/** The page side of the `![[viz.html]]` frame protocol (see
 *  `src/lib/html-embeds.mjs`): tell each embed the site theme — when it
 *  loads, when it asks, and whenever the toggle flips — and size a frame to
 *  the height its embed reports, unless the author fixed one. */

import { isDarkTheme, observeThemeChanges } from './themed-diagrams';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 4000;

function themeMessage() {
  return { type: 'teaman:theme', theme: isDarkTheme() ? 'dark' : 'light' } as const;
}

function postTheme(frame: HTMLIFrameElement) {
  // The sandbox gives the frame an opaque origin, so no narrower target
  // origin can match; the theme name is all the message carries.
  frame.contentWindow?.postMessage(themeMessage(), '*');
}

/** Wires every embed frame on the page. Returns the theme observer, or
 *  `undefined` when the page has no embeds. */
export function initHtmlEmbeds(): MutationObserver | undefined {
  const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('.html-embed iframe'));
  if (frames.length === 0) return;

  for (const frame of frames) {
    frame.addEventListener('load', () => postTheme(frame));
  }

  window.addEventListener('message', (event) => {
    const frame = frames.find(candidate => candidate.contentWindow === event.source);
    const data = event.data as { type?: unknown; height?: unknown } | null;
    if (!frame || !data || typeof data !== 'object') return;
    if (data.type === 'teaman:ready') postTheme(frame);
    if (data.type === 'teaman:resize' && typeof data.height === 'number' && !frame.hasAttribute('data-fixed-height')) {
      const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(data.height)));
      frame.style.height = `${height}px`;
    }
  });

  return observeThemeChanges(() => frames.forEach(postTheme));
}
