// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectReferenceSections, holdJumpTarget } from '../reference-reader';

describe('collectReferenceSections', () => {
  it('indexes prose before the first heading and points it at the document start', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = [
      '<p>Overview text before any named section.</p>',
      '<h2 id="details">Details</h2>',
      '<p>Section body.</p>',
    ].join('');

    expect(collectReferenceSections(content, [
      { depth: 2, slug: 'details', text: 'Details' },
    ])).toEqual([
      {
        depth: 2,
        slug: 'reference-content',
        text: 'Introduction',
        content: ' Overview text before any named section.',
      },
      {
        depth: 2,
        slug: 'details',
        text: 'Details',
        content: ' Section body.',
      },
    ]);
  });

  it('makes a headingless reference one searchable introduction section', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = '<p>A complete document without section headings.</p>';

    expect(collectReferenceSections(content, [])).toEqual([
      expect.objectContaining({
        slug: 'reference-content',
        content: ' A complete document without section headings.',
      }),
    ]);
  });

  it('sees through contained chapter wrappers without losing the preamble', () => {
    const content = document.createElement('div');
    content.id = 'reference-content';
    content.innerHTML = [
      '<section class="reference-chapter"><p>Preamble.</p></section>',
      '<section class="reference-chapter"><h2 id="chapter">Chapter</h2><p>Body.</p></section>',
    ].join('');

    expect(collectReferenceSections(content, [
      { depth: 2, slug: 'chapter', text: 'Chapter' },
    ]).map(section => section.slug)).toEqual(['reference-content', 'chapter']);
  });
});

describe('holdJumpTarget', () => {
  // Frames are queued and flushed by hand, as in the list-controller tests.
  let frames: FrameRequestCallback[] = [];
  const flush = (count: number) => {
    for (let i = 0; i < count; i++) frames.splice(0).forEach(fn => fn(0));
  };

  /** A target whose top is `layout.top - scrolled`, with the page clamped at `layout.max`. */
  function setup(layout: { top: number; max: number }) {
    let scrolled = 0;
    const target = document.createElement('h2');
    target.style.scrollMarginTop = '100px';
    document.body.replaceChildren(target);
    target.getBoundingClientRect = () => ({ top: layout.top - scrolled }) as DOMRect;
    vi.spyOn(window, 'scrollBy').mockImplementation(((_x: number, y: number) => {
      scrolled = Math.min(layout.max, Math.max(0, scrolled + y));
    }) as typeof window.scrollBy);
    return target;
  }

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('re-aims the jump when chapters above the target change height', () => {
    const layout = { top: 1000, max: 10_000 };
    const target = setup(layout);
    holdJumpTarget(target);

    flush(2);
    expect(target.getBoundingClientRect().top).toBe(100);
    layout.top -= 279; // the chapter before it rendered shorter than its estimate
    flush(1);
    expect(target.getBoundingClientRect().top).toBe(100);
  });

  it('settles at the end of the page, where the target cannot reach its margin', () => {
    const target = setup({ top: 1000, max: 500 });
    holdJumpTarget(target, { settleFrames: 3 });

    flush(10);
    expect(target.getBoundingClientRect().top).toBe(500);
    expect(frames).toHaveLength(0);
  });

  it('lets go as soon as the reader scrolls', () => {
    const layout = { top: 1000, max: 10_000 };
    const target = setup(layout);
    holdJumpTarget(target);

    flush(1);
    window.dispatchEvent(new Event('wheel'));
    layout.top += 300;
    flush(5);
    expect(target.getBoundingClientRect().top).toBe(400);
  });
});
