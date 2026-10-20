import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_DIAGRAM_LANGUAGES, DIAGRAM_KINDS, diagramKind } from '../diagram-kinds.mjs';

const src = join(import.meta.dirname, '../..');

describe('diagram kinds', () => {
  it('names each fence language once', () => {
    const langs = DIAGRAM_KINDS.map(kind => kind.lang);
    expect(new Set(langs).size).toBe(langs.length);
    expect(diagramKind('d2')).toMatchObject({ label: 'D2', render: 'build' });
    expect(diagramKind('js')).toBeUndefined();
    expect(diagramKind(null)).toBeUndefined();
  });

  it('has a browser renderer, loaded on every page, for each client kind', () => {
    const layout = readFileSync(join(src, 'layouts', 'Layout.astro'), 'utf8');
    for (const lang of CLIENT_DIAGRAM_LANGUAGES) {
      expect(existsSync(join(src, 'scripts', `${lang}.ts`)), lang).toBe(true);
      expect(layout, lang).toContain(`from '../scripts/${lang}'`);
    }
  });

  // Each module with a per-kind adapter table checks it covers the registry
  // when it loads; importing them is the test.
  it('has a compiler for each build kind and a PDF renderer for each client kind', async () => {
    await expect(import('../remark-fence-svg.mjs')).resolves.toBeDefined();
    await expect(import('../reference-pdf.mjs')).resolves.toBeDefined();
  });
});
