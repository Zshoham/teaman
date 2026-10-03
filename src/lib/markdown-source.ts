import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** The entry's original file, byte for byte, frontmatter included. */
export async function readMarkdownSource(entry: { filePath?: string }): Promise<string> {
  if (!entry.filePath) throw new Error('Markdown entry has no source file');
  // Astro filePath is relative to its project root. CLI stages always run
  // from the engine; import.meta.url moves when Astro bundles endpoints.
  return readFile(resolve(entry.filePath), 'utf8');
}
