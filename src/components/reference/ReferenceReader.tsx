import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRightIcon, DownloadIcon, SearchIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  buildReferenceHeadingTree,
  collectReferenceSections,
  findReferenceSectionMatches,
  type ReferenceHeading,
  type ReferenceHeadingNode,
  type ReferenceSection,
} from '@/lib/reference-reader';
import { plural } from '@/lib/text';
import { cn } from '@/lib/utils';

interface Props {
  headings: ReferenceHeading[];
  pdfHref: string;
}

/**
 * The contained chapter wrappers, in document order. References short enough
 * that the build left them unwrapped are tracked as a single chapter.
 */
function contentChapters(content: Element): HTMLElement[] {
  const chapters = Array.from(content.querySelectorAll<HTMLElement>(':scope > .reference-chapter'));
  return chapters.length > 0 ? chapters : [content as HTMLElement];
}

function collectSections(headings: ReferenceHeading[]): ReferenceSection[] {
  const content = document.getElementById('reference-content');
  return content ? collectReferenceSections(content, headings) : [];
}

/** Map every heading to its parent so the active branch is an O(depth) lookup. */
function buildParentMap(nodes: ReferenceHeadingNode[]): Map<string, string> {
  const parents = new Map<string, string>();
  const walk = (branch: ReferenceHeadingNode[], parent?: string) => {
    for (const node of branch) {
      if (parent) parents.set(node.slug, parent);
      walk(node.children, node.slug);
    }
  };
  walk(nodes);
  return parents;
}

function collectCollapsibleSlugs(nodes: ReferenceHeadingNode[]): string[] {
  return nodes.flatMap(node => [
    ...(node.children.length > 0 ? [node.slug] : []),
    ...collectCollapsibleSlugs(node.children),
  ]);
}

function headingIndent(depth: number): string {
  if (depth <= 2) return 'pl-3';
  if (depth === 3) return 'pl-6';
  if (depth === 4) return 'pl-9';
  if (depth === 5) return 'pl-12';
  return 'pl-15';
}

interface BranchProps {
  node: ReferenceHeadingNode;
  /** This node is the section currently being read. */
  isCurrent: boolean;
  /** This node is the current section or an ancestor of it. */
  inActivePath: boolean;
  activePath: ReadonlySet<string>;
  currentSlug?: string;
  collapsedSlugs: ReadonlySet<string>;
  onOpenChange: (slug: string, open: boolean) => void;
}

function TocBranchImpl({
  node,
  isCurrent,
  activePath,
  currentSlug,
  collapsedSlugs,
  onOpenChange,
}: BranchProps) {
  const hasChildren = node.children.length > 0;
  // Purely what the reader last asked for. Reaching a section reveals its
  // ancestors by clearing their collapsed flags (see RailContents), not by
  // overriding this — otherwise the trigger would be inert while reading here.
  const open = !collapsedSlugs.has(node.slug);

  const row = (
    <div className="flex min-w-0 items-start gap-0.5">
      <a
        href={`#${node.slug}`}
        aria-current={isCurrent ? 'location' : undefined}
        className={cn(
          'min-w-0 flex-1 rounded-md border-l-2 py-1.5 font-serif text-sm leading-snug no-underline transition-colors',
          headingIndent(node.depth),
          hasChildren ? 'pr-1' : 'pr-2',
          isCurrent
            ? 'border-primary bg-muted text-foreground'
            : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {node.text}
      </a>
      {hasChildren && (
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-xs" className="group/collapse mt-1" />}
          aria-label={`${open ? 'Collapse' : 'Expand'} subsections of ${node.text}`}
        >
          <ChevronRightIcon
            data-icon="inline-start"
            className="transition-transform group-data-[panel-open]/collapse:rotate-90"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      )}
    </div>
  );

  if (!hasChildren) return <li>{row}</li>;

  return (
    <li>
      <Collapsible open={open} onOpenChange={nextOpen => onOpenChange(node.slug, nextOpen)}>
        {row}
        <CollapsibleContent>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {node.children.map(child => (
              <TocBranch
                key={child.slug}
                node={child}
                isCurrent={child.slug === currentSlug}
                inActivePath={activePath.has(child.slug)}
                activePath={activePath}
                currentSlug={currentSlug}
                collapsedSlugs={collapsedSlugs}
                onOpenChange={onOpenChange}
              />
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/**
 * A book-sized table of contents is ~750 nodes, and the read position changes
 * on almost every scroll frame. Skip any branch that neither was nor is on the
 * active path: nothing under it can have changed, so its stale `activePath`
 * and `currentSlug` are unobservable. Re-rendering then costs O(depth) instead
 * of O(headings) per section change.
 */
const TocBranch = memo(TocBranchImpl, (prev, next) =>
  prev.node === next.node
  && prev.collapsedSlugs === next.collapsedSlugs
  && prev.onOpenChange === next.onOpenChange
  && prev.isCurrent === next.isCurrent
  && prev.inActivePath === next.inActivePath
  && !prev.inActivePath
  && !next.inActivePath,
);

function RailContents({
  headings,
  pdfHref,
  currentSlug,
  query,
  onQueryChange,
  sections,
  ready,
  fullHeight = false,
}: Props & {
  currentSlug?: string;
  query: string;
  onQueryChange: (value: string) => void;
  sections: ReferenceSection[];
  ready: boolean;
  fullHeight?: boolean;
}) {
  const matches = useMemo(
    () => findReferenceSectionMatches(sections, query),
    [query, sections],
  );
  const searching = query.trim().length > 0;
  const headingTree = useMemo(() => buildReferenceHeadingTree(headings), [headings]);
  const collapsibleSlugs = useMemo(() => collectCollapsibleSlugs(headingTree), [headingTree]);
  const parentBySlug = useMemo(() => buildParentMap(headingTree), [headingTree]);
  const activePath = useMemo(() => {
    const path = new Set<string>();
    let slug = currentSlug;
    while (slug && !path.has(slug)) {
      path.add(slug);
      slug = parentBySlug.get(slug);
    }
    return path;
  }, [currentSlug, parentBySlug]);
  const [collapsedSlugs, setCollapsedSlugs] = useState<Set<string>>(() => new Set());
  const tocRef = useRef<HTMLElement>(null);
  const allCollapsed = collapsibleSlugs.length > 0
    && collapsibleSlugs.every(slug => collapsedSlugs.has(slug));

  // Stable so a scroll frame never invalidates the memoized branches below.
  const handleOpenChange = useCallback((slug: string, open: boolean) => {
    setCollapsedSlugs(current => {
      const next = new Set(current);
      if (open) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const handleToggleAll = () => {
    setCollapsedSlugs(allCollapsed ? new Set() : new Set(collapsibleSlugs));
  };

  // Reveal the section being read by dropping its ancestors' collapsed flags.
  // Doing it here rather than in the branch keeps the collapse trigger live:
  // a branch the reader closes stays closed until the read position moves on.
  useEffect(() => {
    setCollapsedSlugs(current => {
      if (current.size === 0) return current;
      let next: Set<string> | null = null;
      for (const slug of activePath) {
        if (slug === currentSlug || !current.has(slug)) continue;
        next ??= new Set(current);
        next.delete(slug);
      }
      return next ?? current;
    });
  }, [activePath, currentSlug]);

  useEffect(() => {
    if (searching) return;

    const link = tocRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="location"]');
    const viewport = link
      ?.closest('[data-slot="scroll-area"]')
      ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!link || !viewport || viewport.clientHeight === 0) return;

    const linkRect = link.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const edgePadding = 8;

    if (linkRect.top < viewportRect.top + edgePadding) {
      viewport.scrollTop += linkRect.top - viewportRect.top - edgePadding;
    } else if (linkRect.bottom > viewportRect.bottom - edgePadding) {
      viewport.scrollTop += linkRect.bottom - viewportRect.bottom + edgePadding;
    }
  }, [collapsedSlugs, currentSlug, searching]);

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', fullHeight && 'h-full')}>
      <InputGroup className="h-9 shrink-0 bg-background">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search this document"
          aria-label="Search sections in this document"
          autoComplete="off"
          disabled={!ready}
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear document search"
              onClick={() => onQueryChange('')}
            >
              <XIcon aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className={cn('min-h-0', fullHeight && 'flex flex-1 flex-col')}>
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <p className="m-0 font-mono text-meta-sm uppercase tracking-label text-faint">
            {searching
              ? plural(matches.length, 'section')
              : 'On this page'}
          </p>
          {!searching && collapsibleSlugs.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleToggleAll}
              aria-label={`${allCollapsed ? 'Expand' : 'Collapse'} all table of contents sections`}
              data-reference-toc-toggle-all
            >
              {allCollapsed ? 'expand all' : 'collapse all'}
            </Button>
          )}
        </div>

        <ScrollArea
          className={cn(
            'min-h-0 pr-3 [&_[data-slot=scroll-area-viewport]]:overscroll-contain',
            fullHeight ? 'flex-1' : 'h-[min(60dvh,34rem)]',
          )}
          // A deeply indented entry is wider than the rail, which otherwise
          // makes the whole list scroll sideways and carries every collapse
          // trigger off the right-hand edge — with no horizontal scrollbar to
          // bring it back. Entries wrap instead.
          wrapContent
          data-reference-toc-scroll
        >
          {searching ? (
            matches.length > 0 ? (
              <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Matching sections">
                {matches.map(match => (
                  <li key={match.slug}>
                    <a
                      href={`#${match.slug}`}
                      className="block rounded-md px-2 py-2 no-underline transition-colors hover:bg-muted"
                    >
                      <span className="block font-serif text-sm leading-snug text-foreground">
                        {match.text}
                      </span>
                      <span className="mt-1 line-clamp-2 block font-sans text-meta leading-relaxed text-muted-foreground">
                        {match.excerpt}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 rounded-md bg-muted px-3 py-4 text-center font-mono text-meta text-faint">
                No section contains that phrase.
              </p>
            )
          ) : (
            <nav ref={tocRef} aria-label="Table of contents">
              <ol className="m-0 flex list-none flex-col gap-0.5 px-0 pt-0 pb-2">
                {headingTree.map(node => (
                  <TocBranch
                    key={node.slug}
                    node={node}
                    isCurrent={node.slug === currentSlug}
                    inActivePath={activePath.has(node.slug)}
                    activePath={activePath}
                    currentSlug={currentSlug}
                    collapsedSlugs={collapsedSlugs}
                    onOpenChange={handleOpenChange}
                  />
                ))}
              </ol>
            </nav>
          )}
        </ScrollArea>
      </div>

      <Button variant="outline" className="w-full shrink-0" render={<a href={pdfHref} download />}>
        <DownloadIcon data-icon="inline-start" aria-hidden="true" />
        Download PDF
      </Button>
    </div>
  );
}

export function ReferenceReader({ headings, pdfHref }: Props) {
  const desktopRailAnchorRef = useRef<HTMLDivElement>(null);
  const desktopRailRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<ReferenceSection[] | null>(null);
  const [sections, setSections] = useState<ReferenceSection[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [currentSlug, setCurrentSlug] = useState(headings[0]?.slug);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Segmenting the article into searchable sections walks the whole document,
  // so it waits for someone to actually search instead of running at load.
  const handleQueryChange = useCallback((value: string) => {
    if (value && !sectionsRef.current) {
      sectionsRef.current = collectSections(headings);
      setSections(sectionsRef.current);
    }
    setQuery(value);
  }, [headings]);

  useEffect(() => {
    setReady(true);
    const content = document.getElementById('reference-content');

    // Chapters carry `content-visibility`, so anything inside an un-rendered
    // one has no layout box and reports a zero rect. Chapter boxes themselves
    // are always real, so the read position is resolved in two steps: find the
    // chapter holding the threshold, then the heading within it. That chapter
    // is by definition on screen, so its headings have honest geometry — and
    // it costs a couple of dozen reads per frame instead of one per heading.
    const slugs = new Set(headings.map(heading => heading.slug));
    const chapters = (content ? contentChapters(content) : []).map(element => ({
      element,
      headings: Array.from(element.querySelectorAll<HTMLElement>('h2, h3, h4, h5, h6'))
        .filter(heading => slugs.has(heading.id)),
    }));

    /** Index of the last element whose top is at or above `limit`, or -1. */
    const lastAbove = (items: { getBoundingClientRect(): DOMRect }[], limit: number) => {
      let low = 0;
      let high = items.length - 1;
      let found = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (items[mid].getBoundingClientRect().top <= limit) {
          found = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return found;
    };

    const activeSlugAt = (limit: number) => {
      const chapter = lastAbove(chapters.map(item => item.element), limit);
      if (chapter === -1) return undefined;

      const own = chapters[chapter].headings;
      const heading = lastAbove(own, limit);
      if (heading !== -1) return own[heading].id;

      // Nothing in this chapter has crossed yet, so the previous chapter's
      // last heading is still the section being read.
      for (let index = chapter - 1; index >= 0; index--) {
        const previous = chapters[index].headings;
        if (previous.length > 0) return previous[previous.length - 1].id;
      }
      return undefined;
    };

    let frame = 0;
    let lastPercent = -1;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Every measurement happens before the first style write. Interleaving
        // them made each frame force a fresh layout of the whole article.
        const headerHeight = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
        ) || 0;
        const threshold = headerHeight + 36;
        const desktopRailAnchor = desktopRailAnchorRef.current;
        const desktopRail = desktopRailRef.current;
        const railVisible = Boolean(desktopRailAnchor?.offsetParent && desktopRail?.offsetParent);
        const anchorRect = railVisible ? desktopRailAnchor!.getBoundingClientRect() : null;
        const activeSlug = activeSlugAt(threshold) ?? headings[0]?.slug;
        const contentRect = content?.getBoundingClientRect() ?? null;

        if (anchorRect && desktopRail) {
          const railTop = Math.max(headerHeight + 24, anchorRect.top);
          const viewportHeight = Math.max(0, window.innerHeight - railTop - 24);
          const anchorHeight = Math.max(0, anchorRect.bottom - railTop);
          desktopRail.style.height = `${Math.min(viewportHeight, anchorHeight)}px`;
        }
        setCurrentSlug(activeSlug);

        if (!contentRect) return;
        // The progress bar changes on nearly every frame. Writing it straight
        // to the node keeps scrolling from re-rendering the table of contents.
        const distance = Math.max(1, contentRect.height - window.innerHeight * 0.55);
        const percent = Math.round(
          Math.min(1, Math.max(0, (threshold - contentRect.top) / distance)) * 100,
        );
        if (percent !== lastPercent) {
          lastPercent = percent;
          const bar = progressRef.current;
          if (bar) {
            bar.style.width = `${percent}%`;
            bar.setAttribute('aria-valuenow', String(percent));
          }
        }
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [headings]);

  return (
    <>
      <div
        ref={progressRef}
        className="fixed top-0 left-0 z-40 h-0.5 bg-primary transition-[width] duration-100 motion-reduce:transition-none"
        style={{ width: '0%' }}
        role="progressbar"
        aria-label="Document reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      />

      {/* The narrow-screen rail duplicates a table of contents that is ~750
          nodes on a large reference, and it is `lg:hidden` for most readers.
          Mounting it on first open keeps that cost off the initial page. */}
      <details
        className="rounded-lg border border-border bg-card p-4 lg:hidden"
        onToggle={event => setMobileOpen(event.currentTarget.open)}
      >
        <summary className="font-mono text-meta-lg text-foreground">Browse this document</summary>
        <div className="mt-4 border-t border-border pt-4">
          {mobileOpen && (
            <RailContents
              headings={headings}
              pdfHref={pdfHref}
              currentSlug={currentSlug}
              query={query}
              onQueryChange={handleQueryChange}
              sections={sections}
              ready={ready}
            />
          )}
        </div>
      </details>

      <div ref={desktopRailAnchorRef} className="hidden self-stretch lg:block">
        <aside
          ref={desktopRailRef}
          className="sticky top-[calc(var(--header-h)_+_1.5rem)] h-[calc(100dvh-var(--header-h)-3rem)]"
        >
          <RailContents
            headings={headings}
            pdfHref={pdfHref}
            currentSlug={currentSlug}
            query={query}
            onQueryChange={handleQueryChange}
            sections={sections}
            ready={ready}
            fullHeight
          />
        </aside>
      </div>
    </>
  );
}
