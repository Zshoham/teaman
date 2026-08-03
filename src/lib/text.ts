/**
 * `"1 section"` / `"3 sections"`. Pass `plural` for anything that isn't a bare
 * `+s` ("dailies", "days"). The count is locale-formatted, so large ones get
 * their thousands separators.
 */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : pluralNoun}`;
}

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
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<([a-zA-Z][a-zA-Z\d+.-]{1,31}:[^<>\s]*)>/g, '$1')
    .replace(/<([^\s<>@]+@[^\s<>@]+)>/g, '$1')
    .replace(/<\/?[a-zA-Z][^>\r\n]*>/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, a) => a || p)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '');
  const para = cleaned.split(/\n\s*\n/).map(s => s.trim()).find(Boolean) ?? '';
  if (para.length <= maxLen) return para;
  return para.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}
