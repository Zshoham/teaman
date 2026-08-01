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
