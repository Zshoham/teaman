import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintVault } from '../vault-lint.mjs';

describe('lintVault', () => {
  let vault;
  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'teaman-lint-'));
  });
  afterEach(() => rmSync(vault, { recursive: true, force: true }));

  const write = (rel, body) => {
    const path = join(vault, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  };

  it('reports nothing for an empty vault', () => {
    expect(lintVault(vault)).toEqual({ problems: [], warnings: [] });
  });

  it('fails a guide chapter the build cannot serve, as for reference books', () => {
    write('guides/g/SUMMARY.md', '# G\n\n- [Here](here.md)\n- [Gone](gone.md)\n');
    write('guides/g/here.md', '# Here\n');
    const { problems } = lintVault(vault);
    expect(problems).toEqual(['guides: g/SUMMARY.md points at missing chapter gone.md']);
  });

  it('requires a date on every daily', () => {
    write('dailies/2026-05-04.md', '# no frontmatter\n');
    const { problems } = lintVault(vault);
    expect(problems).toContain('dailies: 2026-05-04.md: date: required');
  });

  it('requires a date and a valid status on every decision', () => {
    write('decisions/adr-0001.md', '---\nstatus: sideways\n---\n');
    const { problems } = lintVault(vault);
    expect(problems).toEqual([
      'decisions: adr-0001.md: title: required',
      'decisions: adr-0001.md: date: required',
      'decisions: adr-0001.md: status: must be one of accepted | proposed | superseded',
    ]);
  });

  it('rejects an unquoted ADR number in lineage, and accepts file names', () => {
    write('decisions/adr-0001.md', '---\ntitle: A\ndate: 2026-01-01\nstatus: accepted\nsupersedes: 0002\n---\n');
    write('decisions/adr-0002.md', '---\ntitle: B\ndate: 2026-01-01\nstatus: superseded\nsupersededBy: adr-0001\n---\n');
    const { problems, warnings } = lintVault(vault);
    expect(problems).toEqual([
      'decisions: adr-0001.md: supersedes: must name an ADR as a string — write adr-0002 (or quote the number)',
    ]);
    expect(warnings).toEqual([]);
  });

  it('checks every kind of file against its collection schema', () => {
    write('notes/n.md', '---\ntags: 3\n---\n');
    write('guides/g/SUMMARY.md', '---\ndraft: maybe\n---\n- [A](a.md)\n');
    write('guides/g/a.md', '---\ntitle: 7\n---\n');
    write('references/r.md', '---\ndate: someday\n---\n');
    write('slides/deck.md', '---\ntags: [1]\n---\n# Deck\n');
    const { problems } = lintVault(vault);
    expect(problems).toEqual([
      'notes: n.md: tags: Invalid input: expected array, received number',
      'guides: g/a.md: title: Invalid input: expected string, received number',
      'guides: g/SUMMARY.md: draft: Invalid input: expected boolean, received string',
      'slides: deck.md: tags.0: Invalid input: expected string, received number',
      'references: r.md: date: not a valid date',
    ]);
  });

  it('accepts comma-separated tags on every type', () => {
    write('notes/n.md', '---\ntags: a, b\n---\n');
    write('dailies/2026-01-01.md', '---\ndate: 2026-01-01\ntags: a, b\n---\n');
    write('references/r.md', '---\ntags: a, b\n---\n');
    expect((lintVault(vault)).problems).toEqual([]);
  });

  it('warns when ADR lineage points at a missing record', () => {
    write('decisions/adr-0001.md', '---\ntitle: T\ndate: 2026-01-01\nstatus: accepted\nsupersededBy: adr-0009\n---\n');
    const { warnings } = lintVault(vault);
    expect(warnings).toContain('decisions: adr-0001.md supersededBy points at missing adr-0009');
  });

  it('requires a SUMMARY.md in every guide directory', () => {
    write('guides/rust/intro.md', '# intro\n');
    const { problems } = lintVault(vault);
    expect(problems).toContain('guides: rust/ has no SUMMARY.md (chapter index)');
  });

  it('fails a reference book SUMMARY that points at a missing chapter, and accepts a complete one', () => {
    write('references/language/SUMMARY.md', '# Language\n\n- [Intro](intro.md)\n- [Missing](missing.md)\n');
    write('references/language/intro.md', '# Intro\n\nBody.\n');
    expect(lintVault(vault).problems).toEqual(['references: language/SUMMARY.md points at missing chapter missing.md']);
    write('references/language/missing.md', '# Missing\n');
    expect(lintVault(vault)).toEqual({ problems: [], warnings: [] });
  });

  it('warns on a wiki-link with no matching note', () => {
    write('notes/a.md', 'see [[Missing Note]]\n');
    const { warnings } = lintVault(vault);
    expect(warnings).toContain('notes: a.md links to missing [[Missing Note]]');
  });

  it('resolves a wiki-link to a note whose filename has spaces', () => {
    write('notes/Missing Note.md', '# x\n');
    write('notes/a.md', 'see [[Missing Note]]\n');
    expect((lintVault(vault)).warnings).toEqual([]);
  });

  it('checks wiki-links in references too', () => {
    write('references/r.md', 'see [[Nope]]\n');
    const { warnings } = lintVault(vault);
    expect(warnings).toContain('references: r.md links to missing [[Nope]]');
  });

  it('resolves links across every rendered type and nested folders', () => {
    write('notes/sub/deep.md', '# deep\n');
    write('decisions/adr-0002.md', '---\ntitle: T\ndate: 2026-01-01\nstatus: accepted\n---\n');
    write('dailies/2026-03-12.md', '---\ndate: 2026-03-12\n---\nsee [[deep]] and [[adr-0002]]\n');
    expect((lintVault(vault)).warnings).toEqual([]);
  });

  it('warns when a link needs the legacy slug match, a heading, or a tie-break', () => {
    write('notes/Shipping Cadence.md', '# x\n');
    write('notes/a/intro.md', '# x\n');
    write('notes/b/intro.md', '# x\n');
    write('notes/c.md', 'see [[shipping-cadence]], [[Shipping Cadence#Why]], [[intro]]\n');
    const { warnings } = lintVault(vault);
    expect(warnings).toEqual([
      'notes: c.md [[shipping-cadence]] only matches notes/Shipping Cadence by slug; Obsidian will not resolve it',
      'notes: c.md [[Shipping Cadence#Why]]: heading links are not supported; linking the page',
      'notes: c.md [[intro]] matches 2 pages; linking notes/a/intro (qualify it as [[notes/a/intro]])',
    ]);
  });

  it('fails note embeds and missing images, and ignores code', () => {
    write('attachments/pic.png', '');
    write('notes/a.md', '![[Gone]] ![[pic.png]] ![[nope.png]] `![[in code]]`\n\n```\n[[fenced]]\n```\n');
    const { problems, warnings } = lintVault(vault);
    expect(problems).toEqual([
      'notes: a.md embeds ![[Gone]]: note embeds are not supported; link it with [[Gone]]',
      'notes: a.md embeds missing image ![[nope.png]]',
    ]);
    expect(warnings).toEqual([]);
  });

  it('accepts HTML embeds the vault has, in pages and decks, and fails missing ones', () => {
    write('attachments/viz.html', '<!doctype html>');
    write('notes/a.md', '![[viz.html]] ![[viz.html#view=sizes|400]] ![[gone.html]]\n');
    write('slides/deck.md', '# Deck\n\n![[viz.html|380]]\n\n---\n\n![[lost.html]] `![[in-code.html]]`\n\n<div>\n![[wrapped.html]]\n</div>\n');
    const { problems } = lintVault(vault);
    expect(problems).toEqual([
      'notes: a.md embeds missing HTML file ![[gone.html]]',
      'slides: deck.md embeds missing HTML file ![[lost.html]]',
      'slides: deck.md embeds missing HTML file ![[wrapped.html]]',
    ]);
  });

  it('warns that slug has no effect where the path carries meaning', () => {
    write('decisions/adr-0001.md', '---\ntitle: T\ndate: 2026-01-01\nstatus: accepted\nslug: x\n---\n');
    write('notes/n.md', '---\nslug: fine\n---\n');
    const { warnings } = lintVault(vault);
    expect(warnings).toEqual(['decisions: adr-0001.md sets "slug", which has no effect on decisions']);
  });
});
