import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openVaultCatalog } from '../../src/lib/vault-catalog.mjs';
import { buildSlides } from '../build-slides.mjs';

const engineDir = fileURLToPath(new URL('../..', import.meta.url));

let scratch;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function setup(files) {
  scratch = mkdtempSync(join(tmpdir(), 'teaman-slides-'));
  const vault = join(scratch, 'vault');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), content);
  }
  return { vault, workDir: join(scratch, 'work'), outDir: join(scratch, 'out') };
}

/** A Slidev stand-in that snapshots what each deck would build from. */
function recordingBuild(workDir) {
  const builds = [];
  const buildDeck = (deckPath, { out, theme, cwd }) => {
    const read = path => (existsSync(join(workDir, path)) ? readFileSync(join(workDir, path), 'utf8') : null);
    builds.push({
      deck: deckPath.slice(workDir.length + 1),
      out,
      theme,
      cwd,
      vars: read('theme/styles/vars.css'),
      logoConfig: read('theme/logo.config.ts'),
      embed: read('talks/public/embeds/viz.html'),
    });
  };
  return { builds, buildDeck };
}

describe('buildSlides', () => {
  it('builds every published deck from a staged, personalised workspace', () => {
    const { vault, workDir, outDir } = setup({
      'slides/talks/intro.md': '# Intro\n\n![[viz.html|300]]\n',
      'slides/talks/wip.md': '---\ndraft: true\n---\n# WIP\n',
      'slides/_templates/tpl.md': '# Template\n',
      'attachments/viz.html': '<p>viz</p>',
      'public/logo.svg': '<svg/>',
    });
    const { builds, buildDeck } = recordingBuild(workDir);

    const built = buildSlides({
      catalog: openVaultCatalog(vault),
      outDir,
      workDir,
      engineDir,
      slidesConfig: { primary: 'red', logo: 'logo.svg' },
      buildDeck,
      log: () => {},
    });

    expect(built).toEqual(['talks/intro']);
    expect(builds).toEqual([expect.objectContaining({
      deck: 'talks/intro.md',
      out: join(outDir, 'slides', 'talks', 'intro'),
      theme: join(workDir, 'theme'),
      cwd: engineDir,
      embed: '<p>viz</p>',
    })]);
    expect(builds[0].vars).toContain('--slidev-theme-primary: red;');
    expect(builds[0].logoConfig).toContain('"teaman-slide-logo.svg"');
    expect(existsSync(workDir)).toBe(false);
  });

  it('refuses decks whose embeds resolve to nothing, before building any', () => {
    const { vault, workDir, outDir } = setup({ 'slides/talk.md': '# Talk\n\n![[gone.html]]\n' });
    const { builds, buildDeck } = recordingBuild(workDir);

    expect(() => buildSlides({ catalog: openVaultCatalog(vault), outDir, workDir, engineDir, buildDeck, log: () => {} }))
      .toThrow('slides: talk.md embeds missing HTML file ![[gone.html]]');
    expect(builds).toEqual([]);
    expect(existsSync(workDir)).toBe(false);
  });
});
