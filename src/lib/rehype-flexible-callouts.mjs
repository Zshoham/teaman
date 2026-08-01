import rehypeCallouts from 'rehype-callouts';

const CALLOUT_MARKER_RE = /^\[!(?<type>[\w-]+)]/;

function humanizeCalloutType(type) {
  return type
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function collectCalloutTypes(node, types) {
  if (node?.type === 'element' && node.tagName === 'blockquote') {
    // remark-rehype surrounds a blockquote's paragraph with newline text
    // nodes. Match rehype-callouts' own normalization instead of assuming the
    // paragraph is literally the first child.
    const paragraph = node.children?.find(child =>
      !(child.type === 'text' && child.value.trim() === '')
    );
    const firstChild = paragraph?.type === 'element' && paragraph.tagName === 'p'
      ? paragraph.children?.[0]
      : undefined;
    const match = firstChild?.type === 'text'
      ? CALLOUT_MARKER_RE.exec(firstChild.value)
      : undefined;

    if (match?.groups?.type) types.add(match.groups.type.toLowerCase());
  }

  for (const child of node?.children ?? []) collectCalloutTypes(child, types);
}

/**
 * Render every valid Obsidian callout marker, including vault-defined types.
 *
 * rehype-callouts intentionally ignores types outside its built-in registry.
 * Discovering the types in each document lets us register a neutral fallback
 * without requiring an engine change for names such as `EDITION-2018`.
 */
export function rehypeFlexibleCallouts(options = {}) {
  return tree => {
    const types = new Set();
    collectCalloutTypes(tree, types);

    const callouts = { ...options.callouts };
    for (const type of types) {
      callouts[type] ??= { title: humanizeCalloutType(type) };
    }

    return rehypeCallouts({ ...options, callouts })(tree);
  };
}
