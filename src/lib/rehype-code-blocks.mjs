/**
 * Add static chrome to Shiki code blocks after Astro has highlighted them.
 *
 * Astro's Shiki pass normalizes every fenced language into `data-language` on
 * the resulting `<pre class="astro-code">`. Running as a rehype plugin after
 * that pass lets this wrapper use the same language Astro actually rendered,
 * including its `plaintext` fallback for an unlabelled fence.
 *
 * Diagram fences deliberately bypass Shiki and therefore never receive the
 * `astro-code` class. Leaving them alone is important: Mermaid and PlantUML
 * replace their `<pre>` contents with SVG on the client.
 */

function hasClass(node, name) {
  // Hand-authored HAST normally uses `className`; Astro's Shiki replacement is
  // parsed from an HTML string and currently carries the literal `class` key.
  // Accept both so this stays compatible with either highlighter output shape.
  const className = node.properties?.className ?? node.properties?.class;
  if (Array.isArray(className)) return className.includes(name);
  return typeof className === 'string' && className.split(/\s+/).includes(name);
}

function languageOf(node) {
  const value = node.properties?.dataLanguage ?? node.properties?.['data-language'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function text(value) {
  return { type: 'text', value };
}

function element(tagName, properties, children) {
  return { type: 'element', tagName, properties, children };
}

function wrapCodeBlock(pre, language) {
  return element('div', {
    className: ['code-block'],
    dataCodeBlock: '',
    dataLanguage: language,
  }, [
    element('div', { className: ['code-block-toolbar'] }, [
      element('span', { className: ['code-block-language'] }, [text(language)]),
      element('button', {
        type: 'button',
        className: ['code-block-copy'],
        dataCopyCode: '',
        ariaLabel: `Copy ${language} code`,
      }, [text('Copy')]),
    ]),
    pre,
  ]);
}

function decorateChildren(parent) {
  if (!Array.isArray(parent.children)) return;

  parent.children = parent.children.map((child) => {
    if (child.type !== 'element') return child;

    const language = child.tagName === 'pre' && hasClass(child, 'astro-code')
      ? languageOf(child)
      : null;
    if (language && !hasClass(parent, 'code-block')) {
      return wrapCodeBlock(child, language);
    }

    decorateChildren(child);
    return child;
  });
}

export function rehypeCodeBlocks() {
  return tree => decorateChildren(tree);
}
