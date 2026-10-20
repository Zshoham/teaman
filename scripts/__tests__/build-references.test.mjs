import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { buildReferences } from '../build-references.mjs';

let scratch;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function setup() {
  scratch = mkdtempSync(join(tmpdir(), 'teaman-references-'));
  const vault = join(scratch, 'vault');
  const write = (path, content) => {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), content);
  };
  return { vault, write };
}

/** A compiler stand-in: the PDF is the Typst it was handed. */
function fakeCompiler() {
  const compiled = [];
  return {
    compiled,
    createCompiler: () => ({
      pdf: ({ mainFileContent }) => (compiled.push(mainFileContent), Buffer.from(mainFileContent)),
      evictCache: () => {},
    }),
  };
}

function build(vault, createCompiler) {
  return buildReferences({
    catalog: openVaultCatalog(vault),
    outDir: join(scratch, 'out'),
    template: '// template',
    diagramCacheDir: join(scratch, 'diagrams'),
    pdfCacheDir: join(scratch, 'pdfs'),
    createCompiler,
    log: () => {},
  });
}

describe('buildReferences', () => {
  it('writes a PDF per published reference', async () => {
    const { vault, write } = setup();
    write('references/live.md', '# Live\n\nHello.\n');
    write('references/draft.md', '---\ndraft: true\n---\n# Draft\n');
    write('references/book/SUMMARY.md', '# Book\n\n- [Intro](intro.md)\n');
    write('references/book/intro.md', '# Intro\n');
    const { createCompiler } = fakeCompiler();

    expect(await build(vault, createCompiler)).toEqual({ rendered: ['book', 'live'], reused: [] });
    expect(readFileSync(join(scratch, 'out', 'references', 'live', 'reference.pdf'), 'utf8')).toContain('Hello.');
    expect(existsSync(join(scratch, 'out', 'references', 'draft'))).toBe(false);
  });

  it('reuses a cached PDF until the source or an image it names changes', async () => {
    const { vault, write } = setup();
    write('references/r.md', '# R\n\n![Chart](chart.png)\n');
    write('references/chart.png', 'first');
    const { compiled, createCompiler } = fakeCompiler();

    await build(vault, createCompiler);
    expect(await build(vault, createCompiler)).toEqual({ rendered: [], reused: ['r'] });
    expect(compiled).toHaveLength(1);

    write('references/chart.png', 'second');
    expect(await build(vault, createCompiler)).toEqual({ rendered: ['r'], reused: [] });
  });

  it('refuses a book the site cannot build, before compiling anything', async () => {
    const { vault, write } = setup();
    write('references/ok.md', '# Ok\n');
    write('references/book/SUMMARY.md', '# Book\n\n- [Gone](gone.md)\n');
    const { compiled, createCompiler } = fakeCompiler();

    await expect(build(vault, createCompiler)).rejects.toThrow('book/SUMMARY.md points at missing chapter gone.md');
    expect(compiled).toEqual([]);
  });
});
