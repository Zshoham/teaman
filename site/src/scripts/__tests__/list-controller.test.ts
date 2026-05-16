// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createListController } from '../list-controller';

// ── rAF queue ─────────────────────────────────────────────────────────────────
// The controller schedules DOM work via requestAnimationFrame. We queue
// callbacks manually and flush explicitly so tests stay synchronous and the
// rafId state machine works correctly (the synchronous-fire pattern breaks
// because the assignment `rafId = rAF(fn)` always fires AFTER fn sets
// rafId = null, leaving rafId = 1 permanently).

let rafQueue: Array<{ id: number; fn: FrameRequestCallback }> = [];
let rafIdCounter = 0;

function flushRAF() {
  const pending = [...rafQueue];
  rafQueue = [];
  for (const { fn } of pending) fn(0);
}

beforeEach(() => {
  rafQueue = [];
  rafIdCounter = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    const id = ++rafIdCounter;
    rafQueue.push({ id, fn });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const idx = rafQueue.findIndex(e => e.id === id);
    if (idx !== -1) rafQueue.splice(idx, 1);
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('article');
  el.dataset.entry = '';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

interface Rig {
  container: HTMLElement;
  items: HTMLElement[];
  emptyState: HTMLElement;
  pills: HTMLElement[];   // [all, note, guide, slides]
  sortToggle: HTMLElement;
  sortArrow: HTMLElement;
  activeWrap: HTMLElement;
  activeName: HTMLElement;
  clearBtn: HTMLElement;
}

function buildRig(): Rig {
  const container = document.createElement('div');
  const items = [
    makeItem({ 'data-type': 'note',   'data-updated': '2026-05-10', 'data-tags': 'architecture meta' }),
    makeItem({ 'data-type': 'guide',  'data-updated': '2026-05-05', 'data-tags': 'infrastructure' }),
    makeItem({ 'data-type': 'slides', 'data-updated': '2026-05-08', 'data-tags': '' }),
  ];
  items.forEach(i => container.appendChild(i));

  const emptyState = document.createElement('div');
  emptyState.hidden = true;

  const pills = ['all', 'note', 'guide', 'slides'].map(v => {
    const b = document.createElement('button');
    b.dataset.filter = v;
    b.setAttribute('aria-pressed', v === 'all' ? 'true' : 'false');
    return b;
  });

  const sortArrow = document.createElement('span');
  sortArrow.textContent = '↓';
  const sortToggle = document.createElement('button');
  sortToggle.setAttribute('aria-label', 'Sort: newest first');
  sortToggle.appendChild(sortArrow);

  const activeWrap = document.createElement('div');
  activeWrap.hidden = true;
  const activeName = document.createElement('span');
  const clearBtn = document.createElement('button');

  document.body.appendChild(container);

  return { container, items, emptyState, pills, sortToggle, sortArrow, activeWrap, activeName, clearBtn };
}

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('filter', () => {
  it('shows all items on initial render (synchronous, no rAF needed)', () => {
    const { container, items, pills, emptyState } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });
    // Initial apply() runs synchronously — no flushRAF needed.
    items.forEach(item => expect(item.hidden).toBe(false));
  });

  it('hides non-matching items when a type pill is clicked', () => {
    const { container, items, pills, emptyState } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    pills[1].click(); // note
    flushRAF();

    expect(items[0].hidden).toBe(false); // note — visible
    expect(items[1].hidden).toBe(true);  // guide — hidden
    expect(items[2].hidden).toBe(true);  // slides — hidden
  });

  it('restores all items when the "all" pill is clicked after a filter', () => {
    const { container, items, pills, emptyState } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    // Both clicks coalesce into one rAF; the final filterValue wins.
    pills[2].click(); // guide
    pills[0].click(); // all
    flushRAF();

    items.forEach(item => expect(item.hidden).toBe(false));
  });

  it('sets aria-pressed correctly on filter pills', () => {
    const { container, pills, emptyState } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    pills[2].click(); // guide
    flushRAF();

    expect(pills[0].getAttribute('aria-pressed')).toBe('false');
    expect(pills[1].getAttribute('aria-pressed')).toBe('false');
    expect(pills[2].getAttribute('aria-pressed')).toBe('true');
    expect(pills[3].getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the empty state when no items match', () => {
    const { container, emptyState, pills } = buildRig();
    const unknownPill = document.createElement('button');
    unknownPill.dataset.filter = 'video';

    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills: [...pills, unknownPill], attr: 'data-type' },
    });

    unknownPill.click();
    flushRAF();

    expect(emptyState.hidden).toBe(false);
  });

  it('hides the empty state again once items become visible', () => {
    const { container, emptyState, pills } = buildRig();
    const unknownPill = document.createElement('button');
    unknownPill.dataset.filter = 'video';

    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills: [...pills, unknownPill], attr: 'data-type' },
    });

    unknownPill.click();
    flushRAF();
    pills[0].click(); // all
    flushRAF();

    expect(emptyState.hidden).toBe(true);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────────

describe('sort', () => {
  it('initially orders items by data-updated descending (synchronous)', () => {
    const { container, sortToggle, sortArrow } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      sort: { toggle: sortToggle, attr: 'data-updated', arrow: sortArrow },
    });
    // Initial sort is synchronous (no rAF).
    const ordered = Array.from(container.children) as HTMLElement[];
    expect(ordered[0].getAttribute('data-updated')).toBe('2026-05-10');
    expect(ordered[1].getAttribute('data-updated')).toBe('2026-05-08');
    expect(ordered[2].getAttribute('data-updated')).toBe('2026-05-05');
  });

  it('toggles to ascending order on click and updates the arrow', () => {
    const { container, sortToggle, sortArrow } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      sort: { toggle: sortToggle, attr: 'data-updated', arrow: sortArrow },
    });

    sortToggle.click();
    flushRAF();

    const ordered = Array.from(container.children) as HTMLElement[];
    expect(ordered[0].getAttribute('data-updated')).toBe('2026-05-05');
    expect(sortArrow.textContent).toBe('↑');
  });

  it('toggles back to descending on a second click (state coalesces)', () => {
    const { container, sortToggle, sortArrow } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      sort: { toggle: sortToggle, attr: 'data-updated', arrow: sortArrow },
    });

    // Both clicks coalesce into one rAF; net effect = no change from desc.
    sortToggle.click(); // → asc
    sortToggle.click(); // → desc
    flushRAF();

    const ordered = Array.from(container.children) as HTMLElement[];
    expect(ordered[0].getAttribute('data-updated')).toBe('2026-05-10');
    expect(sortArrow.textContent).toBe('↓');
  });

  it('updates aria-label via ariaLabelFor callback', () => {
    const { container, sortToggle, sortArrow } = buildRig();
    createListController({
      container,
      itemSelector: '[data-entry]',
      sort: {
        toggle: sortToggle,
        attr: 'data-updated',
        arrow: sortArrow,
        ariaLabelFor: dir => `Sort: ${dir === 'asc' ? 'oldest first' : 'newest first'}`,
      },
    });

    sortToggle.click();
    flushRAF();
    expect(sortToggle.getAttribute('aria-label')).toBe('Sort: oldest first');

    sortToggle.click();
    flushRAF();
    expect(sortToggle.getAttribute('aria-label')).toBe('Sort: newest first');
  });
});

// ── Tag filtering ─────────────────────────────────────────────────────────────

describe('tag', () => {
  function buildTagRig() {
    const rig = buildRig();
    const { container, activeWrap, activeName, clearBtn } = rig;

    const tagBtn = document.createElement('button');
    tagBtn.dataset.tag = 'architecture';
    container.appendChild(tagBtn);

    createListController({
      container,
      itemSelector: '[data-entry]',
      tag: {
        attr: 'data-tags',
        activeWrap,
        activeName,
        clearButton: clearBtn,
        clickRoot: container,
      },
    });

    return { ...rig, tagBtn };
  }

  it('shows only items with the clicked tag', () => {
    const { items, tagBtn } = buildTagRig();
    tagBtn.click();
    flushRAF();

    expect(items[0].hidden).toBe(false); // has 'architecture'
    expect(items[1].hidden).toBe(true);  // has 'infrastructure', not 'architecture'
    expect(items[2].hidden).toBe(true);  // no tags
  });

  it('shows all items again when the same tag is clicked twice (toggle)', () => {
    const { items, tagBtn } = buildTagRig();

    tagBtn.click();
    tagBtn.click(); // coalesced: net = no active tag
    flushRAF();

    items.forEach(item => expect(item.hidden).toBe(false));
  });

  it('reveals the active-tag chip when a tag is selected', () => {
    const { tagBtn, activeWrap, activeName } = buildTagRig();
    expect(activeWrap.hidden).toBe(true);

    tagBtn.click();
    flushRAF();

    expect(activeWrap.hidden).toBe(false);
    expect(activeName.textContent).toBe('#architecture');
  });

  it('hides the active-tag chip when the clear button is clicked', () => {
    const { tagBtn, activeWrap, clearBtn } = buildTagRig();

    tagBtn.click();
    flushRAF();
    clearBtn.click();
    flushRAF();

    expect(activeWrap.hidden).toBe(true);
  });

  it('clears the tag filter and shows all items when clear is clicked', () => {
    const { items, tagBtn, clearBtn } = buildTagRig();

    tagBtn.click();
    flushRAF();
    clearBtn.click();
    flushRAF();

    items.forEach(item => expect(item.hidden).toBe(false));
  });

  it('marks the active tag button with the is-active class', () => {
    const { tagBtn } = buildTagRig();
    tagBtn.click();
    flushRAF();
    expect(tagBtn.classList.contains('is-active')).toBe(true);
  });

  it('removes is-active class when the tag is cleared', () => {
    const { tagBtn, clearBtn } = buildTagRig();

    tagBtn.click();
    flushRAF();
    clearBtn.click();
    flushRAF();

    expect(tagBtn.classList.contains('is-active')).toBe(false);
  });

  it('uses a custom formatName when provided', () => {
    const rig = buildRig();
    const { container, activeWrap, activeName, clearBtn } = rig;
    const tagBtn = document.createElement('button');
    tagBtn.dataset.tag = 'meta';
    container.appendChild(tagBtn);

    createListController({
      container,
      itemSelector: '[data-entry]',
      tag: {
        attr: 'data-tags',
        activeWrap,
        activeName,
        clearButton: clearBtn,
        clickRoot: container,
        formatName: tag => `Topic: ${tag}`,
      },
    });

    tagBtn.click();
    flushRAF();

    expect(activeName.textContent).toBe('Topic: meta');
  });
});

// ── Combined filter + tag ─────────────────────────────────────────────────────

describe('filter + tag combination', () => {
  it('applies both filter and tag simultaneously', () => {
    const { container, items, pills, emptyState, activeWrap, activeName, clearBtn } = buildRig();

    const tagBtn = document.createElement('button');
    tagBtn.dataset.tag = 'architecture';
    container.appendChild(tagBtn);

    createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
      tag: { attr: 'data-tags', activeWrap, activeName, clearButton: clearBtn, clickRoot: container },
    });

    pills[1].click(); // filter: note only
    flushRAF();
    tagBtn.click();   // tag: architecture
    flushRAF();

    expect(items[0].hidden).toBe(false); // note with 'architecture' — visible
    expect(items[1].hidden).toBe(true);  // guide (filtered out by type)
    expect(items[2].hidden).toBe(true);  // slides (filtered out by type)
  });
});

// ── refresh ───────────────────────────────────────────────────────────────────

describe('refresh', () => {
  it('re-applies current visibility state after an external DOM mutation', () => {
    const { container, items, pills, emptyState } = buildRig();
    const ctrl = createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    pills[1].click(); // filter: note
    flushRAF();       // items[1] and items[2] now hidden

    // External mutation undoes the hide.
    items[1].hidden = false;

    ctrl.refresh();
    flushRAF();

    // Controller re-applies the filter state — items[1] (guide) hidden again.
    expect(items[1].hidden).toBe(true);
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('destroy', () => {
  it('removes event listeners so subsequent clicks have no effect', () => {
    const { container, items, pills, emptyState } = buildRig();
    const ctrl = createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    ctrl.destroy();

    pills[1].click(); // should be a no-op after destroy
    flushRAF();

    items.forEach(item => expect(item.hidden).toBe(false));
  });

  it('cancels any pending rAF when destroyed before it fires', () => {
    const { container, items, pills, emptyState } = buildRig();
    const ctrl = createListController({
      container,
      itemSelector: '[data-entry]',
      emptyState,
      filter: { pills, attr: 'data-type' },
    });

    pills[1].click(); // schedule a rAF (still in queue)
    ctrl.destroy();   // should cancel the pending rAF

    flushRAF(); // queue is now empty — nothing to flush

    // Items are still in their initial (all-visible) state.
    items.forEach(item => expect(item.hidden).toBe(false));
  });
});
