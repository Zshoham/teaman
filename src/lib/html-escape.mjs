/**
 * HTML escaping for the engine's raw-`html` mdast nodes.
 *
 * The remark plugins emit markup as strings rather than building hast, so that
 * every render path produces byte-identical output — which means each of them
 * needs to escape interpolated values. There were five copies of this with
 * three different character sets; these two are the whole vocabulary.
 */

/** Escape a value being placed in text content. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a value being placed in a double-quoted attribute. A superset of
 * `escapeHtml`: `"` would end the attribute, and `>` must go too because a
 * literal one inside an injected value would end every later `<svg[^>]*>`
 * opening-tag match early.
 */
export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
