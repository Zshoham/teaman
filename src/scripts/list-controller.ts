/**
 * Generic filter + sort + tag controller for any list of DOM items.
 *
 * Items are cached on init, so per-event work is O(n) attribute reads
 * (no DOM queries). Sort reorders via a single DocumentFragment append,
 * which preserves DOM order for sibling-combinator CSS (e.g. `~` borders).
 * Multiple state changes in the same tick coalesce into one rAF pass.
 */

export interface FilterConfig {
  /** Buttons whose data-filter selects the current filter value. */
  pills: HTMLElement[];
  /** Item attribute holding the value to compare against. */
  attr: string;
  /** Value meaning "match everything". Defaults to 'all'. */
  defaultValue?: string;
}

export interface SortConfig {
  toggle: HTMLElement;
  /** Item attribute holding the sort key (compared as a string). */
  attr: string;
  /** Optional element whose textContent will be updated to ↑/↓. */
  arrow?: HTMLElement | null;
  /** Initial direction. Defaults to 'desc'. */
  initial?: SortDir;
  /** Builds an aria-label for the toggle given the current direction. */
  ariaLabelFor?: (dir: SortDir) => string;
}

export interface TagConfig {
  /** Item attribute holding space-separated tags. */
  attr: string;
  /** Wrapper around the active-tag chip; toggled with `hidden`. */
  activeWrap?: HTMLElement | null;
  /** Element whose textContent reflects the active tag name. */
  activeName?: HTMLElement | null;
  /** Button that clears the active tag. */
  clearButton?: HTMLElement | null;
  /** Formats the displayed tag name. Defaults to `#tag`. */
  formatName?: (tag: string) => string;
  /** Root for delegated tag-click handling. Defaults to document. */
  clickRoot?: Document | HTMLElement;
  /** Root for active tag chrome updates. Defaults to clickRoot, then container. */
  tagRoot?: Document | HTMLElement;
}

export interface LoadMoreConfig {
  /** Button toggled visible while more matched items can be revealed. */
  button: HTMLElement;
  /** How many items to reveal per page. */
  pageSize: number;
  /** Formats the button's text given the remaining matched-but-hidden count. */
  label?: (remaining: number) => string;
}

export interface ListControllerConfig {
  /** The element that directly contains the items (parent of the items). */
  container: HTMLElement;
  /** Selector used to find items inside `container`. */
  itemSelector: string;
  /** Element to show when no items match; toggled with `hidden`. */
  emptyState?: HTMLElement | null;
  filter?: FilterConfig;
  sort?: SortConfig;
  tag?: TagConfig;
  loadMore?: LoadMoreConfig;
}

export type SortDir = 'asc' | 'desc';

interface Item {
  el: HTMLElement;
  filterValue: string;
  sortValue: string;
  tags: string[];
}

export interface ListController {
  /** Force a re-application of the current state. */
  refresh: () => void;
  /** Tear down event listeners. */
  destroy: () => void;
}

export function createListController(cfg: ListControllerConfig): ListController {
  const items: Item[] = Array.from(
    cfg.container.querySelectorAll<HTMLElement>(cfg.itemSelector)
  ).map(el => ({
    el,
    filterValue: cfg.filter ? el.getAttribute(cfg.filter.attr) ?? '' : '',
    sortValue: cfg.sort ? el.getAttribute(cfg.sort.attr) ?? '' : '',
    tags: cfg.tag
      ? (el.getAttribute(cfg.tag.attr) ?? '').split(' ').filter(Boolean)
      : [],
  }));

  const filterDefault = cfg.filter?.defaultValue ?? 'all';
  let filterValue = filterDefault;
  let sortDir: SortDir = cfg.sort?.initial ?? 'desc';
  let activeTag: string | null = null;
  let page = 1;

  // Changing the filter or active tag should drop the page count — otherwise
  // a user who scrolled deep into one list keeps the same page when they
  // switch contexts, which feels random. Sort flips do not reset; they only
  // change the order of the already-revealed window.
  const resetPage = () => { page = 1; };

  let rafId: number | null = null;
  let needsSort = false;

  const schedule = (reorder: boolean) => {
    if (reorder) needsSort = true;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      apply();
    });
  };

  const applySort = () => {
    if (!cfg.sort) return;
    const ordered = items.slice().sort((a, b) => {
      const cmp = a.sortValue.localeCompare(b.sortValue);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // Single fragment append batches the DOM moves into one operation.
    const frag = document.createDocumentFragment();
    for (const it of ordered) frag.appendChild(it.el);
    cfg.container.appendChild(frag);
  };

  const applyVisibility = () => {
    const pageSize = cfg.loadMore?.pageSize;
    const limit = pageSize ? pageSize * page : Infinity;
    let matched = 0;
    let shown = 0;
    for (const it of items) {
      const matchFilter = filterValue === filterDefault || it.filterValue === filterValue;
      const matchTag = !activeTag || it.tags.includes(activeTag);
      const eligible = matchFilter && matchTag;
      let show = false;
      if (eligible) {
        matched++;
        if (shown < limit) {
          show = true;
          shown++;
        }
      }
      it.el.hidden = !show;
    }
    if (cfg.emptyState) cfg.emptyState.hidden = matched > 0;
    if (cfg.loadMore) {
      const remaining = matched - shown;
      cfg.loadMore.button.hidden = remaining <= 0;
      if (cfg.loadMore.label) cfg.loadMore.button.textContent = cfg.loadMore.label(remaining);
    }
  };

  const applyTagChrome = () => {
    if (!cfg.tag) return;
    const { activeWrap, activeName, formatName } = cfg.tag;
    const tagRoot = cfg.tag.tagRoot ?? cfg.tag.clickRoot ?? cfg.container;
    if (activeWrap) {
      if (activeTag && activeName) {
        activeWrap.hidden = false;
        activeName.textContent = formatName ? formatName(activeTag) : `#${activeTag}`;
      } else {
        activeWrap.hidden = true;
      }
    }
    tagRoot.querySelectorAll<HTMLElement>('[data-tag]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.tag === activeTag);
    });
  };

  const apply = () => {
    if (needsSort) {
      applySort();
      needsSort = false;
    }
    applyVisibility();
    applyTagChrome();
  };

  // ── Wiring ──────────────────────────────────────────────────────────────
  const cleanups: Array<() => void> = [];

  if (cfg.filter) {
    const { pills } = cfg.filter;
    const setPressed = () => {
      pills.forEach(b =>
        b.setAttribute('aria-pressed', (b.dataset.filter ?? '') === filterValue ? 'true' : 'false')
      );
    };
    const onClick = (b: HTMLElement) => () => {
      filterValue = b.dataset.filter || filterDefault;
      resetPage();
      setPressed();
      schedule(false);
    };
    pills.forEach(b => {
      const handler = onClick(b);
      b.addEventListener('click', handler);
      cleanups.push(() => b.removeEventListener('click', handler));
    });
    setPressed();
  }

  if (cfg.sort) {
    const { toggle, arrow, ariaLabelFor } = cfg.sort;
    const onClick = () => {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      if (arrow) arrow.textContent = sortDir === 'asc' ? '↑' : '↓';
      if (ariaLabelFor) toggle.setAttribute('aria-label', ariaLabelFor(sortDir));
      schedule(true);
    };
    toggle.addEventListener('click', onClick);
    cleanups.push(() => toggle.removeEventListener('click', onClick));
  }

  if (cfg.tag) {
    const root: Document | HTMLElement = cfg.tag.clickRoot ?? document;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const tagEl = target?.closest<HTMLElement>('[data-tag]');
      if (!tagEl) return;
      e.preventDefault();
      const tag = tagEl.dataset.tag || '';
      activeTag = activeTag === tag ? null : tag;
      resetPage();
      schedule(false);
    };
    root.addEventListener('click', onClick);
    cleanups.push(() => root.removeEventListener('click', onClick));

    const clearBtn = cfg.tag.clearButton;
    if (clearBtn) {
      const onClear = () => {
        activeTag = null;
        resetPage();
        schedule(false);
      };
      clearBtn.addEventListener('click', onClear);
      cleanups.push(() => clearBtn.removeEventListener('click', onClear));
    }
  }

  if (cfg.loadMore) {
    const { button } = cfg.loadMore;
    const onClick = () => {
      page++;
      schedule(false);
    };
    button.addEventListener('click', onClick);
    cleanups.push(() => button.removeEventListener('click', onClick));
  }

  // Initial sort + paint without waiting for rAF.
  needsSort = !!cfg.sort;
  apply();

  return {
    refresh: () => schedule(false),
    destroy: () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanups.forEach(fn => fn());
    },
  };
}
