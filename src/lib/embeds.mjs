/**
 * Obsidian embeds, `![[target|label]]`, read once for every renderer: the
 * site (`remark-wiki-links.mjs`), decks (`deck-embeds.mjs`), the reference
 * PDF, Confluence sync, and `doctor`. Each renderer only formats what this
 * module says an embed is, so a vault embeds the same file, at the same size,
 * with the same caption — and fails for the same reasons — everywhere.
 *
 * - The target names an attachment: an image, or a self-contained `.html`
 *   page (see `html-embeds.mjs`). Anything else is a note, which teaman does
 *   not transclude.
 * - A `?query`/`#fragment` on the target rides along (`suffix`); the rest is
 *   the `path` looked up in the vault.
 * - Obsidian reads a numeric label as a size. An image's `|300` is its width,
 *   as in Obsidian; a frame always fills the column, so its `|600` is its
 *   height. `|800x600` is width × height for both. Any other label is the
 *   `caption`.
 * - `resolveEmbed` finds the file the way Obsidian finds any attachment (the
 *   vault index's `resolveAttachment`), and names the one `problem` — a note
 *   embed or a missing file — that every renderer refuses and doctor reports.
 *
 * Client-safe.
 */

/** `![[inner]]` in text; the inner text is read by `splitWikiTarget`. */
export const EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;

const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
const HTML_RE = /\.html?$/i;
const SIZE_RE = /^(\d+)(?:x(\d+))?$/;

/**
 * The inside of `[[target|label]]` or `![[target|label]]`, split at its first
 * pipe and trimmed. `label` is undefined when there is no pipe.
 *
 * @param {string} inner
 * @returns {{ target: string, label?: string }}
 */
export function splitWikiTarget(inner) {
  const pipe = inner.indexOf('|');
  return pipe === -1
    ? { target: inner.trim() }
    : { target: inner.slice(0, pipe).trim(), label: inner.slice(pipe + 1).trim() };
}

/**
 * What an embed target names, judged by its file extension (any suffix
 * ignored).
 *
 * @param {string} target
 * @returns {'image' | 'html' | 'note'}
 */
export function embedKind(target) {
  const path = target.split(/[?#]/, 1)[0].trim();
  if (IMAGE_RE.test(path)) return 'image';
  if (HTML_RE.test(path)) return 'html';
  return 'note';
}

/** `solar-system.html` → `Solar system`: a frame needs an accessible name. */
function titleFromFile(path) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  const words = (dot > 0 ? file.slice(0, dot) : file).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * @typedef {object} Embed
 * @property {string} target  as written, trimmed
 * @property {'image'|'html'|'note'} kind
 * @property {string} path  the target minus its suffix and any leading `./`
 *   or `/`: what is looked up in the vault, and where a deck stages the file
 * @property {string} suffix  the target's `?query`/`#fragment`, or ''
 * @property {string} title  the caption, or a name made from the file name
 * @property {string} [caption]  a label that is not a size
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * Everything `![[target|label]]` says about one embed, before it is looked
 * up. A label equal to the target (markdown-it's default) is no label.
 *
 * @param {string} target
 * @param {string} [label]
 * @returns {Embed}
 */
export function readEmbed(target, label) {
  const trimmed = target.trim();
  const cut = trimmed.search(/[?#]/);
  const path = (cut === -1 ? trimmed : trimmed.slice(0, cut)).trim().replace(/^(\.\/|\/)+/, '');
  const kind = embedKind(trimmed);
  const text = label?.trim() && label.trim() !== trimmed ? label.trim() : undefined;
  const size = text ? SIZE_RE.exec(text) : null;
  const caption = text && !size ? text : undefined;
  // `|N` is one number: an image's width, a frame's height.
  const [width, height] = !size ? []
    : size[2] ? [Number(size[1]), Number(size[2])]
      : kind === 'html' ? [undefined, Number(size[1])] : [Number(size[1]), undefined];
  return {
    target: trimmed,
    kind,
    path,
    suffix: cut === -1 ? '' : trimmed.slice(cut),
    title: caption ?? titleFromFile(path),
    ...(caption ? { caption } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

/**
 * @typedef {Embed & { file: string | null, problem: string | null }} ResolvedEmbed
 *   `file`: the vault file it embeds; `problem`: why it cannot be rendered
 *   (a note embed, or no such file), which every renderer refuses
 */

/**
 * An embed read and looked up from the file it is written in.
 *
 * @param {string} target
 * @param {string | undefined} label
 * @param {{ resolveAttachment?: (target: string, fromPath?: string) => string | null, fromFile?: string }} lookup
 *   `resolveAttachment` is the vault index's; without one, no file is found
 * @returns {ResolvedEmbed}
 */
export function resolveEmbed(target, label, { resolveAttachment, fromFile } = {}) {
  const embed = readEmbed(target, label);
  const written = embed.target;
  if (embed.kind === 'note') {
    return {
      ...embed,
      file: null,
      problem: `![[${written}]] embeds a note, which teaman does not support — link it with [[${written}]] instead`,
    };
  }
  const file = resolveAttachment?.(written, fromFile) ?? null;
  const noun = embed.kind === 'html' ? 'HTML file' : 'image';
  return { ...embed, file, problem: file ? null : `![[${written}]]: no ${noun} named “${written}” in the vault` };
}
