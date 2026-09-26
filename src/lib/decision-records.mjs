/**
 * What an Architecture Decision Record is, as data every consumer shares: the
 * statuses the schema accepts, how an ADR is titled when it stands alone, and
 * the text search indexes for it. Client-safe — the timeline island reads it.
 * Discovery (reading the files) is `discover-decisions.mjs`; where an ADR is
 * shown is `adrNum`/`adrHref` in `entry-identity.mjs`.
 */

/** Every status an ADR may carry, in the order the timeline lists them. */
export const ADR_STATUSES = /** @type {const} */ (['accepted', 'proposed', 'superseded']);

/**
 * An ADR's title where it appears outside the timeline (the home feed, search).
 *
 * @param {string} num
 * @param {string} title
 */
export function adrDisplayTitle(num, title) {
  return `ADR-${num} · ${title}`;
}

/**
 * The plain text search indexes for an ADR: its title, summary, and body with
 * heading and bullet markers dropped.
 *
 * @param {{ title: string, summary?: string, body: string }} record
 */
export function adrSearchText({ title, summary, body }) {
  const text = [summary, body]
    .filter(Boolean)
    .join('\n')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .trim();
  return `${title}\n${text}`;
}
