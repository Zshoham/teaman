import type { APIRoute } from 'astro';
import { getPublished } from '../../lib/published';
import { loadGuides } from '../../lib/guides';
import { readMarkdownSource } from '../../lib/markdown-source';

export async function getStaticPaths() {
  const [notes, dailies, decisions, guides] = await Promise.all([
    getPublished('notes'), getPublished('dailies'), getPublished('decisions'), loadGuides(),
  ]);
  // A guide's chapters: only those that appear in a published guide.
  const chapters = guides.flatMap(guide => guide.chapters.map(chapter => chapter.entry));
  const entries = [...notes, ...dailies, ...decisions, ...chapters];
  return entries.map(entry => ({
    params: { path: `${entry.collection}/${entry.id}.md` },
    props: { entry },
  }));
}

export const GET: APIRoute = async ({ props }) => new Response(
  await readMarkdownSource(props.entry),
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
);
