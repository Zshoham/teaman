import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';

export interface GuideChapter {
  slug: string;
  title: string;
}

export interface Guide {
  slug: string;
  title: string;
  chapters: GuideChapter[];
  dir: string;
}

const guidesRoot = resolve(process.cwd(), '../content/guides');

export function listGuides(): Guide[] {
  if (!existsSync(guidesRoot)) return [];
  return readdirSync(guidesRoot).flatMap(name => {
    const dir = join(guidesRoot, name);
    if (!statSync(dir).isDirectory()) return [];
    const summary = join(dir, 'SUMMARY.md');
    if (!existsSync(summary)) return [];
    return [parseGuide(name, dir, readFileSync(summary, 'utf8'))];
  });
}

export function getGuide(slug: string): Guide | null {
  const dir = join(guidesRoot, slug);
  const summary = join(dir, 'SUMMARY.md');
  if (!existsSync(summary)) return null;
  return parseGuide(slug, dir, readFileSync(summary, 'utf8'));
}

function parseGuide(slug: string, dir: string, summary: string): Guide {
  let title = slug.replace(/-/g, ' ');
  const chapters: GuideChapter[] = [];
  for (const line of summary.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) { title = h1[1]; continue; }
    const item = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(\.?\/?(.+?)\.md\)/);
    if (item) chapters.push({ title: item[1], slug: item[2] });
  }
  return { slug, title, dir, chapters };
}
