import MarkdownIt from 'markdown-it';

/**
 * An entry's title, and the heading that is its title. One rule for every
 * page the vault becomes — the site, the reference PDF, Confluence, the
 * catalog — so a page is titled the same wherever it lands:
 *
 * - the title is the frontmatter `title`, else the text of the title heading,
 *   else the entry's id, humanized (its last segment, `-`/`_` as spaces);
 * - the title heading is a level-1 heading that opens the body. Authors keep
 *   it for Obsidian's preview; every renderer shows the title itself and drops
 *   that heading, whether or not frontmatter also names a title.
 *
 * The site's Markdown pipeline drops it in mdast (`remark-strip-h1.mjs`); a
 * test holds the two to the same heading.
 */

const markdown = new MarkdownIt({ html: true });

/**
 * The heading opening `body`, if it is level 1: its text, and the body
 * without it. Link reference definitions render nothing (markdown-it leaves
 * them out of its tokens), so one may come first; only the heading's own
 * lines are removed, never what precedes it.
 *
 * @param {string} body  Markdown, frontmatter removed
 * @returns {{ text: string, rest: string } | null}
 */
function titleHeading(body) {
  const tokens = markdown.parse(body, {});
  const first = tokens.findIndex(token => !token.hidden);
  const heading = tokens[first];
  if (heading?.type !== 'heading_open' || heading.tag !== 'h1' || !heading.map) return null;
  const text = tokens[first + 1]?.content ?? '';
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  lines.splice(heading.map[0], heading.map[1] - heading.map[0]);
  return {
    // `# Title {#custom-id}` names its anchor, not its title.
    text: text.replace(/\s+\{#[^}]+\}\s*$/, '').trim(),
    rest: lines.join('\n').replace(/^\n+/, ''),
  };
}

/** An id as a title: `notes/my_first-note` → `my first note`. */
export function humanizeId(id) {
  return String(id).split('/').at(-1).replace(/[-_]+/g, ' ').trim();
}

/**
 * @param {{ data?: Record<string, unknown> | null, body?: string, id: string }} entry
 * @returns {string}
 */
export function entryTitle({ data, body = '', id }) {
  const title = data?.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  return titleHeading(body)?.text || humanizeId(id);
}

/**
 * `body` without its title heading, as every renderer shows it.
 *
 * @param {string} body
 */
export function withoutTitleHeading(body) {
  return titleHeading(body)?.rest ?? body;
}
