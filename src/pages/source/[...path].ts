import type { APIRoute } from 'astro';
import { getPublished } from '../../lib/published';
import { listGuides } from '../../lib/guides';
import { readMarkdownSource } from '../../lib/markdown-source';

export async function getStaticPaths() {
  const [notes, dailies, decisions, chapters, guides] = await Promise.all([
    getPublished('notes'), getPublished('dailies'),
    getPublished('decisions'), getPublished('guides'), listGuides(),
  ]);
  // Only expose chapters that actually appear in a published guide.
  const visibleChapters = new Set(guides.flatMap(guide =>
    guide.chapters.map(chapter => `${guide.slug}/${chapter.slug}`)));
  const entries = [...notes, ...dailies, ...decisions,
    ...chapters.filter(chapter => visibleChapters.has(chapter.id))];
  return entries.map(entry => ({
    params: { path: `${entry.collection}/${entry.id}.md` },
    props: { entry },
  }));
}

export const GET: APIRoute = async ({ props }) => new Response(
  await readMarkdownSource(props.entry),
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
);
