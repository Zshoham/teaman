export function wordMeta(words: number): string {
  return `${words.toLocaleString()} words`;
}

export function readingTimeMeta(words: number): string {
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min read`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function extractExcerpt(body: string, maxLen = 220): string {
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
