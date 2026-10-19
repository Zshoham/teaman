// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { initHtmlEmbeds } from '../html-embeds';

const observers: MutationObserver[] = [];

/** MutationObserver callbacks are microtask-scheduled; let them drain. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** An embed frame whose window is a stub, so nothing loads. */
function addFrame({ fixed = false } = {}) {
  const figure = document.createElement('figure');
  figure.className = 'html-embed';
  const frame = document.createElement('iframe');
  if (fixed) frame.setAttribute('data-fixed-height', '');
  const contentWindow = { postMessage: vi.fn() };
  Object.defineProperty(frame, 'contentWindow', { value: contentWindow });
  figure.append(frame);
  document.body.append(figure);
  return { frame, contentWindow };
}

function fromEmbed(source: unknown, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));
}

function init() {
  const observer = initHtmlEmbeds();
  if (observer) observers.push(observer);
  return observer;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.dataset.theme = 'light';
});

afterEach(() => {
  observers.splice(0).forEach(o => o.disconnect());
  document.documentElement.removeAttribute('data-theme');
});

describe('initHtmlEmbeds', () => {
  it('does nothing on a page without embeds', () => {
    expect(init()).toBeUndefined();
  });

  it('tells an embed that loaded before the script ran the theme at once', () => {
    document.documentElement.dataset.theme = 'dark';
    const { contentWindow } = addFrame();
    init();
    expect(contentWindow.postMessage).toHaveBeenCalledWith({ type: 'teaman:theme', theme: 'dark' }, '*');
  });

  it('tells an embed the theme when it loads, when it asks, and when the toggle flips', async () => {
    const { frame, contentWindow } = addFrame();
    init();

    frame.dispatchEvent(new Event('load'));
    expect(contentWindow.postMessage).toHaveBeenLastCalledWith({ type: 'teaman:theme', theme: 'light' }, '*');

    document.documentElement.dataset.theme = 'dark';
    await settle();
    expect(contentWindow.postMessage).toHaveBeenLastCalledWith({ type: 'teaman:theme', theme: 'dark' }, '*');

    contentWindow.postMessage.mockClear();
    fromEmbed(contentWindow, { type: 'teaman:ready' });
    expect(contentWindow.postMessage).toHaveBeenCalledWith({ type: 'teaman:theme', theme: 'dark' }, '*');
  });

  it('sizes a frame to the height its embed reports, within bounds, unless the author fixed it', () => {
    const free = addFrame();
    const fixed = addFrame({ fixed: true });
    init();

    fromEmbed(free.contentWindow, { type: 'teaman:resize', height: 612.4 });
    expect(free.frame.style.height).toBe('613px');
    fromEmbed(free.contentWindow, { type: 'teaman:resize', height: 10 });
    expect(free.frame.style.height).toBe('120px');

    fromEmbed(fixed.contentWindow, { type: 'teaman:resize', height: 900 });
    expect(fixed.frame.style.height).toBe('');
  });

  it('ignores messages from anything but its own frames', () => {
    const { frame } = addFrame();
    init();
    fromEmbed({ postMessage: vi.fn() }, { type: 'teaman:resize', height: 700 });
    fromEmbed(window, { type: 'teaman:resize', height: 700 });
    expect(frame.style.height).toBe('');
  });
});
