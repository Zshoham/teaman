import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertBuildable, buildProblems } from '../build-problems.mjs';
import { openVaultCatalog } from '../vault-catalog.mjs';

let vault;
afterEach(() => {
  if (vault) rmSync(vault, { recursive: true, force: true });
  vault = undefined;
});

function write(files) {
  vault = mkdtempSync(join(tmpdir(), 'teaman-build-problems-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), content);
  }
  return openVaultCatalog(vault);
}

// Each row is a vault and what fails its build, by the stage that refuses it.
const CASES = [
  {
    name: 'a clean vault',
    files: {
      'references/r.md': '# R\n',
      'guides/g/SUMMARY.md': '- [A](a.md)\n',
      'guides/g/a.md': '# A\n',
      'slides/talk.md': '# Talk\n',
    },
    problems: {},
  },
  {
    name: 'a reference book listing a missing chapter, drafted or not',
    files: {
      'references/book/SUMMARY.md': '- [Gone](gone.md)\n',
      'references/wip/SUMMARY.md': '---\ndraft: true\n---\n- [Gone](gone.md)\n',
    },
    problems: {
      references: [
        'references: book/SUMMARY.md lists no Markdown chapters',
        'references: book/SUMMARY.md points at missing chapter gone.md',
        'references: wip/SUMMARY.md lists no Markdown chapters',
        'references: wip/SUMMARY.md points at missing chapter gone.md',
      ],
    },
  },
  {
    name: 'a reference whose frontmatter does not parse',
    files: { 'references/r.md': '---\ntitle: [\n---\n# R\n' },
    problems: { references: [expect.stringMatching(/^references: r\.md: /)] },
  },
  {
    name: 'a guide listing a missing chapter, unless it is a draft',
    files: {
      'guides/g/SUMMARY.md': '- [Gone](gone.md)\n',
      'guides/wip/SUMMARY.md': '---\ndraft: true\n---\n- [Gone](gone.md)\n',
    },
    problems: { guides: ['guides: g/SUMMARY.md points at missing chapter gone.md'] },
  },
  {
    name: 'a guide index its schema rejects, drafted or not',
    files: {
      'guides/g/SUMMARY.md': '---\ntags: 3\n---\n- [A](a.md)\n',
      'guides/g/a.md': '# A\n',
      'guides/wip/SUMMARY.md': '---\ndraft: "yes"\n---\n',
    },
    problems: {
      guides: [
        expect.stringMatching(/^guides: g\/SUMMARY\.md: tags: /),
        expect.stringMatching(/^guides: wip\/SUMMARY\.md: draft: /),
      ],
    },
  },
  {
    name: 'a deck embedding an HTML file the vault lacks',
    files: { 'slides/talk.md': '# Talk\n\n![[gone.html]]\n', 'slides/viz/ok.html': '<p>ok</p>' },
    problems: { slides: ['slides: talk.md embeds missing HTML file ![[gone.html]]'] },
  },
];

describe.each(CASES)('$name', ({ files, problems }) => {
  it('is refused by exactly the stages that build it', () => {
    const catalog = write(files);
    for (const part of ['references', 'guides', 'slides']) {
      expect(buildProblems(catalog, { parts: [part] }), part).toEqual(problems[part] ?? []);
    }
    expect(buildProblems(catalog)).toEqual(Object.values(problems).flat());
  });
});

describe('assertBuildable', () => {
  it('throws with every problem of the part, and passes a part that builds', () => {
    const catalog = write({ 'guides/g/SUMMARY.md': '- [Gone](gone.md)\n', 'references/r.md': '# R\n' });
    expect(() => assertBuildable(catalog, 'guides'))
      .toThrow('The vault cannot build:\n  guides: g/SUMMARY.md points at missing chapter gone.md');
    expect(() => assertBuildable(catalog, 'references')).not.toThrow();
  });
});
