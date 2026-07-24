/** Renders links to Jira / Confluence / GitLab as "smart link" chips: a tinted
 *  stub carrying the parsed ref, a hairline divider, and the link's own text as
 *  a serif tail.
 *
 *      [Drop the write-through layer](https://gitlab.com/platform/api/-/merge_requests/284)
 *      → <a class="tm-link" data-tm-service="gitlab">
 *          <span class="tm-stub"><span class="tm-mark"></span>!284</span>
 *          <span class="tm-tail">Drop the write-through layer</span>
 *        </a>
 *
 *  A link with no meaningful text of its own (a bare URL, an autolink, or text
 *  that just repeats the ref) renders `tm-bare`: the stub alone, carrying the
 *  fully-qualified ref (`platform/api!284`) since nothing else supplies context.
 *
 *  Like the other engine remark plugins this emits a raw `html` node rather than
 *  building hast, so the markup is identical in every render path. Styling lives
 *  in `src/styles/global.css` (`.tm-link`), including the service marks — those
 *  are CSS masks, so the glyph costs no per-link bytes and inherits its colour.
 *
 *  Parsing (and the vault-configurable host map) is in `smart-links.mjs`.
 */
import { parseSmartLink, resolveHosts } from './smart-links.mjs';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Flatten a link's children to plain text — the label is display-only, so
 *  emphasis inside it is dropped rather than nested into the chip. */
function textOf(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  if (node.type === 'image') return node.alt ?? '';
  if (!Array.isArray(node.children)) return '';
  return node.children.map(textOf).join('');
}

/** True when the link text adds nothing the stub won't already show. */
function isRedundantLabel(label, parsed, url) {
  if (!label) return true;
  const normalized = label.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === url.toLowerCase()) return true;
  // GFM autolinks keep the scheme in the href but may drop it in the text.
  if (normalized === url.toLowerCase().replace(/^https?:\/\//, '')) return true;
  return (
    normalized === parsed.ref.toLowerCase() ||
    normalized === parsed.fullRef.toLowerCase()
  );
}

function render(parsed, label, url) {
  const bare = !label;
  const ref = bare ? parsed.fullRef : parsed.ref;
  // Hover affordance: the ref in full, plus the host it lives on — useful when
  // a vault links to more than one instance of the same service.
  const tooltip = `${parsed.fullRef} · ${parsed.host}`;

  const classes = bare ? 'tm-link tm-bare' : 'tm-link';
  const stub =
    `<span class="tm-stub"><span class="tm-mark" aria-hidden="true"></span>` +
    `<span class="tm-ref">${escapeHtml(ref)}</span></span>`;
  const tail = bare ? '' : `<span class="tm-tail">${escapeHtml(label)}</span>`;

  return (
    `<a class="${classes}" data-tm-service="${escapeHtml(parsed.service)}" ` +
    `data-tm-kind="${escapeHtml(parsed.kind)}" href="${escapeHtml(url)}" ` +
    `title="${escapeHtml(tooltip)}">${stub}${tail}</a>`
  );
}

/**
 * @param {{hosts?: Record<string, readonly string[]>}} [options]
 *   `hosts` is a vault's `config.smartLinks` — service → extra hostnames. It
 *   extends the built-in defaults rather than replacing them.
 */
export function remarkSmartLinks(options = {}) {
  const hosts = resolveHosts(options.hosts);

  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== 'link') {
          walk(child);
          continue;
        }
        const parsed = parseSmartLink(child.url, hosts);
        if (!parsed) {
          walk(child);
          continue;
        }
        const text = textOf(child);
        let label = isRedundantLabel(text, parsed, child.url) ? '' : text.trim();
        // A bare Confluence URL still has a human title hiding in its slug.
        if (!label && parsed.title) label = parsed.title;

        node.children[i] = { type: 'html', value: render(parsed, label, child.url) };
      }
    };
    walk(tree);
  };
}
