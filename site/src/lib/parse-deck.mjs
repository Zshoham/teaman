/**
 * Parses a Slidev deck's markdown into a title and plain-text body suitable
 * for search indexing. Extracts the title from frontmatter if present, and
 * strips slide separator lines so pagefind doesn't treat them as boundaries.
 *
 * @param {string} markdown - Raw deck markdown
 * @returns {{ title: string | null, content: string }}
 */
export function parseDeck(markdown) {
  let title = null;
  let body = markdown;

  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end !== -1) {
      const frontmatter = body.slice(4, end);
      body = body.slice(end + 5);
      const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '');
    }
  }

  // Drop slide separators so they don't get treated as frontmatter or chunk
  // markers by pagefind.
  body = body.replace(/^---\s*$/gm, '');

  return { title, content: body.trim() };
}
