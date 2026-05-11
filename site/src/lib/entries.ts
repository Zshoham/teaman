import { getCollection } from 'astro:content';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { listGuides } from './guides';

export type EntryType = 'note' | 'guide' | 'slides';

export const TYPE_LABEL: Record<EntryType, string> = {
  note: 'note',
  guide: 'guide',
  slides: 'slides',
};

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  excerpt: string;
  tags: string[];
  updated: string;
  created: string;
  /** Display-ready summary string, e.g. "1,234 words" or "12 slides". */
  meta: string;
  href: string;
}

export function wordMeta(words: number): string {
  return `${words.toLocaleString()} words`;
}

export function readingTimeMeta(words: number): string {
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min read`;
}

function slidesMeta(count: number): string {
  return `${count} ${count === 1 ? 'slide' : 'slides'}`;
}

const base = import.meta.env.BASE_URL;
const contentRoot = resolve(process.cwd(), '../content');

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripFrontmatter(md: string): { fm: string; body: string } {
  if (!md.startsWith('---\n')) return { fm: '', body: md };
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) return { fm: '', body: md };
  return { fm: md.slice(4, end), body: md.slice(end + 5) };
}

function readFm(fm: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function extractExcerpt(body: string, maxLen = 220): string {
  const cleaned = body
    .replace(/^---\s*$/gm, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, a) => a || p)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '');
  const para = cleaned.split(/\n\s*\n/).map(s => s.trim()).find(Boolean) ?? '';
  if (para.length <= maxLen) return para;
  return para.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function safeMtime(path: string): Date {
  try { return statSync(path).mtime; } catch { return new Date(); }
}

export async function loadNoteEntries(): Promise<Entry[]> {
  const notes = await getCollection('notes');
  return notes
    .filter(n => !n.data.draft)
    .map(n => {
      const body = (n.body ?? '') as string;
      const date = (n.data.date ?? new Date()) as Date;
      return {
        id: `note-${n.id}`,
        type: 'note' as const,
        title: n.data.title ?? n.id,
        excerpt: extractExcerpt(body),
        tags: n.data.tags ?? [],
        updated: isoDate(date),
        created: isoDate(date),
        meta: wordMeta(wordCount(body)),
        href: `${base}notes/${n.id}/`,
      };
    });
}

export function loadSlideEntries(): Entry[] {
  const slidesDir = join(contentRoot, 'slides');
  if (!existsSync(slidesDir)) return [];
  return readdirSync(slidesDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => {
      const path = join(slidesDir, f);
      const md = readFileSync(path, 'utf8');
      const { fm, body } = stripFrontmatter(md);
      const data = readFm(fm);
      const slideCount = body.split(/^---\s*$/m).filter(s => s.trim()).length || 1;
      const id = f.replace(/\.md$/, '');
      const stat = statSync(path);
      return {
        id: `slides-${id}`,
        type: 'slides' as const,
        title: data.title ?? id.replace(/-/g, ' '),
        excerpt: extractExcerpt(body),
        tags: data.tags
          ? data.tags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean)
          : [],
        updated: isoDate(stat.mtime),
        created: isoDate(stat.birthtime ?? stat.mtime),
        meta: slidesMeta(slideCount),
        href: `${base}slides/${id}/`,
      };
    });
}

export function loadGuideEntries(): Entry[] {
  return listGuides().map(g => {
    const summaryPath = join(g.dir, 'SUMMARY.md');
    const summaryBody = readFileSync(summaryPath, 'utf8');
    let excerpt = '';
    let words = 0;
    let stat = safeMtime(summaryPath);

    for (const chapter of g.chapters) {
      const chapterPath = join(g.dir, `${chapter.slug}.md`);
      if (!existsSync(chapterPath)) continue;
      const body = readFileSync(chapterPath, 'utf8');
      if (!excerpt) excerpt = extractExcerpt(body);
      words += wordCount(body);
      const chapterStat = safeMtime(chapterPath);
      if (chapterStat > stat) stat = chapterStat;
    }

    if (!excerpt) excerpt = extractExcerpt(summaryBody);
    return {
      id: `guide-${g.slug}`,
      type: 'guide' as const,
      title: g.title,
      excerpt,
      tags: [],
      updated: isoDate(stat),
      created: isoDate(stat),
      meta: wordMeta(words),
      href: `${base}guides/${g.slug}/`,
    };
  });
}

/** Loads notes, slides, and guides and returns a single list sorted by `updated` desc. */
export async function loadAllEntries(): Promise<Entry[]> {
  const [notes, slides, guides] = await Promise.all([
    loadNoteEntries(),
    Promise.resolve(loadSlideEntries()),
    Promise.resolve(loadGuideEntries()),
  ]);
  return [...notes, ...slides, ...guides].sort((a, b) => b.updated.localeCompare(a.updated));
}
