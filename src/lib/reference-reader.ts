export interface ReferenceHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface ReferenceHeadingNode extends ReferenceHeading {
  children: ReferenceHeadingNode[];
}

export interface ReferenceSection extends ReferenceHeading {
  content: string;
}

export interface ReferenceSectionMatch extends ReferenceHeading {
  excerpt: string;
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Split rendered reference content into searchable sections. Prose before the
 * first heading is represented by a synthetic introduction target pointing at
 * the content root, which also makes a headingless document searchable.
 */
export function collectReferenceSections(
  content: Element,
  headings: ReferenceHeading[],
): ReferenceSection[] {
  const children = Array.from(content.children);
  const blocks = children.some(child => child.classList.contains('reference-chapter'))
    ? children.flatMap(child => (child.classList.contains('reference-chapter')
        ? Array.from(child.children)
        : [child]))
    : children;
  const headingBySlug = new Map(headings.map(heading => [heading.slug, heading]));
  const sections: ReferenceSection[] = [];
  let current: ReferenceSection | null = null;

  for (const node of blocks) {
    if (/^H[2-6]$/.test(node.tagName) && node.id && headingBySlug.has(node.id)) {
      if (current) sections.push(current);
      current = { ...headingBySlug.get(node.id)!, content: '' };
      continue;
    }

    const text = node.textContent ?? '';
    if (!current && compact(text)) {
      current = {
        depth: 2,
        slug: content.id || 'reference-content',
        text: 'Introduction',
        content: '',
      };
    }
    if (current) current.content += ` ${text}`;
  }
  if (current) sections.push(current);
  return sections;
}

/** Convert the flat heading stream emitted by Astro into a navigable tree. */
export function buildReferenceHeadingTree(
  headings: ReferenceHeading[],
): ReferenceHeadingNode[] {
  const roots: ReferenceHeadingNode[] = [];
  const stack: ReferenceHeadingNode[] = [];

  for (const heading of headings) {
    const node: ReferenceHeadingNode = { ...heading, children: [] };
    while (stack.length > 0 && stack.at(-1)!.depth >= node.depth) stack.pop();

    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

/** Case-insensitive phrase search over pre-segmented document sections. */
export function findReferenceSectionMatches(
  sections: ReferenceSection[],
  query: string,
): ReferenceSectionMatch[] {
  const phrase = compact(query).toLocaleLowerCase();
  if (!phrase) return [];

  return sections.flatMap(section => {
    const haystack = compact(`${section.text} ${section.content}`);
    const index = haystack.toLocaleLowerCase().indexOf(phrase);
    if (index === -1) return [];

    const context = 58;
    const start = Math.max(0, index - context);
    const end = Math.min(haystack.length, index + phrase.length + context);
    return [{
      depth: section.depth,
      slug: section.slug,
      text: section.text,
      excerpt: `${start > 0 ? '…' : ''}${haystack.slice(start, end)}${end < haystack.length ? '…' : ''}`,
    }];
  });
}

/**
 * Keep an in-page jump target at its `scroll-margin-top` while the chapters
 * around it render.
 *
 * Chapters carry `content-visibility: auto`, so until a chapter is first
 * painted it occupies only its estimated `contain-intrinsic-size`. A jump lands
 * correctly against those estimates, then the chapters near the new viewport
 * render at their real heights a frame or two later and the target slides
 * away — hundreds of pixels on a book-sized reference. Rather than give up the
 * containment (see rehype-reference-sections.mjs), the jump is re-aimed each
 * frame until the target has held still for `settleFrames` frames. Any input
 * from the reader ends the hold, so it never fights a scroll they started.
 *
 * Returns a function that cancels the hold.
 */
export function holdJumpTarget(
  target: HTMLElement,
  { settleFrames = 10, maxFrames = 120 }: { settleFrames?: number; maxFrames?: number } = {},
): () => void {
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  let frame = 0;
  let frames = 0;
  let stable = 0;
  let last = Number.NaN;

  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of inputs) window.removeEventListener(type, stop, true);
  };

  const step = () => {
    const offset = target.getBoundingClientRect().top - margin;
    if (Math.abs(offset) > 1) window.scrollBy(0, offset);
    // Near the end of the page the target cannot reach its margin; the
    // clamped position not moving between frames counts as settled too.
    const top = target.getBoundingClientRect().top;
    stable = Math.abs(top - last) <= 1 ? stable + 1 : 0;
    last = top;
    if (stable >= settleFrames || ++frames >= maxFrames) return stop();
    frame = requestAnimationFrame(step);
  };

  for (const type of inputs) window.addEventListener(type, stop, { capture: true, passive: true });
  frame = requestAnimationFrame(step);
  return stop;
}
