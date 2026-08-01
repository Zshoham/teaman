import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { fileURLToPath } from 'url';
import { join } from 'path';

import {
  TYPST_PACKAGE_DIR,
  createReferenceCompiler,
  typstPackageFiles,
} from '../typst-packages.mjs';

const template = readFileSync(
  fileURLToPath(new URL('../../../resources/reference-template.typ', import.meta.url)),
  'utf8',
);

/** Compile a fragment and return its error diagnostics, if any. */
function errorsFor(compiler, mainFileContent) {
  const compiled = compiler.compile({ mainFileContent });
  try {
    return compiler.fetchDiagnostics(compiled.takeDiagnostics())
      .filter(diagnostic => diagnostic.severity < 3)
      .map(diagnostic => diagnostic.message);
  } catch {
    // `takeDiagnostics` throws instead of returning an empty list when the
    // document compiled cleanly.
    return [];
  }
}

describe('vendored Typst packages', () => {
  it('mounts every file the reference template imports', () => {
    const files = typstPackageFiles();
    expect(files).toContain(`${TYPST_PACKAGE_DIR}/showybox/showy.typ`);
    expect(files).toContain(`${TYPST_PACKAGE_DIR}/codly/codly.typ`);
    // codly reads these at compile time from inside its own sources.
    expect(files).toContain(`${TYPST_PACKAGE_DIR}/codly/src/args.json`);
    expect(files).toContain(`${TYPST_PACKAGE_DIR}/codly/src/typst-small.png`);
    for (const file of files) expect(file.startsWith(`${TYPST_PACKAGE_DIR}/`)).toBe(true);
  });

  it('keeps the template importing the mounted paths rather than @preview', () => {
    expect(template).not.toContain('@preview/');
    for (const path of ['/_teaman/showybox/showy.typ', '/_teaman/codly/codly.typ']) {
      expect(template).toContain(`#import "${path}"`);
    }
  });

  it('resolves the imports without a package registry', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'teaman-typst-packages-'));
    try {
      const imports = [
        '#import "/_teaman/showybox/showy.typ": showybox',
        '#import "/_teaman/codly/codly.typ": codly, codly-init',
        '#show: codly-init.with()',
        '#showybox(title: "Note")[body]',
        '#raw("let x = 1", block: true, lang: "rust")',
      ].join('\n');

      expect(errorsFor(createReferenceCompiler(workspace), imports)).toEqual([]);
      // Without the mounted files the same source must fail, proving the shadow
      // mount — not a cached package download — is what satisfies the imports.
      expect(errorsFor(NodeCompiler.create({ workspace }), imports))
        .toEqual([expect.stringContaining('file not found')]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
