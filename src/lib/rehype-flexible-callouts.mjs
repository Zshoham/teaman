import rehypeCallouts from 'rehype-callouts';

const CALLOUT_MARKER_RE = /^\[!(?<type>[\w-]+)]/;

function element(tagName, properties, children = []) {
  return { type: 'element', tagName, properties, children };
}

// Obsidian shows its note pencil for a type it does not know, and
// rehype-callouts shows nothing; the type tag needs an icon to carry, so a
// vault-defined type gets the pencil too.
function fallbackIcon() {
  const path = d => element('path', { d });
  return element('div', { className: ['callout-title-icon'], ariaHidden: 'true' }, [
    element('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '1em',
      height: '1em',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }, [path('M12 20h9'), path('M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z')]),
  ]);
}

function humanizeCalloutType(type) {
  return type
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function hasClass(node, name) {
  return node?.type === 'element' && [node.properties?.className ?? []].flat().includes(name);
}

// Only a plain-text title can be a repeat of the type: `[!note] [note](/x)`
// is a link, and `[!note] `note`` is code, whatever their text says.
function plainText(node) {
  return node.children.every(child => child.type === 'text')
    ? node.children.map(child => child.value).join('')
    : undefined;
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
 * The callout's type becomes a tag at the head of its title: the indicator
 * icon and the type's name, which the stylesheet sets as a filled label in the
 * callout's top border. A title that only repeats the type's name ("Note" for
 * a bare `[!note]`) is dropped, so the tag is not read or shown twice. The tag
 * is kept out of the search index; the title stays in it.
 */
function tagCalloutTitles(node, titles, showIndicator) {
  // rehype-callouts writes the attribute name as is, not as `dataCallout`.
  const type = node?.properties?.['data-callout'];
  if (type && hasClass(node, 'callout')) {
    const label = titles[type] ?? humanizeCalloutType(type);
    const title = node.children?.[0];
    if (hasClass(title, 'callout-title') && !title.children.some(child => hasClass(child, 'callout-tag'))) {
      const icon = title.children.find(child => hasClass(child, 'callout-title-icon'));
      const text = title.children.find(child => hasClass(child, 'callout-title-text'));
      const tag = element('div', { className: ['callout-tag'], dataPagefindIgnore: '' }, [
        icon ?? (showIndicator ? fallbackIcon() : undefined),
        element('span', { className: ['callout-tag-label'] }, [{ type: 'text', value: label }]),
      ].filter(Boolean));
      const repeatsType = text && plainText(text)?.trim().toLowerCase() === label.toLowerCase();
      title.children = title.children
        .filter(child => child !== icon && !(repeatsType && child === text));
      title.children.unshift(tag);
    }
  }

  for (const child of node?.children ?? []) tagCalloutTitles(child, titles, showIndicator);
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

    rehypeCallouts({ ...options, callouts })(tree);

    const titles = {};
    for (const [type, config] of Object.entries(callouts)) {
      if (config?.title) titles[type] = config.title;
    }
    // With indicators turned off, no type gets one, the fallback included.
    tagCalloutTitles(tree, titles, options.showIndicator !== false);
  };
}
