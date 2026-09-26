import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADR_STATUSES, adrDisplayTitle, adrSearchText } from '../decision-records.mjs';
import { discoverDecisions } from '../discover-decisions.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('decision records', () => {
  it('lists the statuses in timeline order', () => {
    expect(ADR_STATUSES).toEqual(['accepted', 'proposed', 'superseded']);
  });

  it('titles an ADR by number and title', () => {
    expect(adrDisplayTitle('0007', 'Use Astro')).toBe('ADR-0007 · Use Astro');
  });

  it('indexes the title, summary, and body without Markdown markers', () => {
    expect(adrSearchText({ title: 'T', summary: 'Why.', body: '## Context\n- one\n- two' }))
      .toBe('T\nWhy.\nContext\none\ntwo');
  });
});

describe('discoverDecisions', () => {
  it('finds ADRs in nested folders with their number and frontmatter', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-adrs-'));
    mkdirSync(join(root, '2026'), { recursive: true });
    writeFileSync(join(root, 'adr-0001.md'), '---\ntitle: One\n---\nBody one.\n');
    writeFileSync(join(root, '2026', 'adr-0002.md'), '---\ntitle: Two\n---\nBody two.\n');

    expect(discoverDecisions(root).map(({ id, num, data, body }) => ({ id, num, title: data.title, body })))
      .toEqual([
        { id: '2026/adr-0002', num: '0002', title: 'Two', body: 'Body two.\n' },
        { id: 'adr-0001', num: '0001', title: 'One', body: 'Body one.\n' },
      ]);
  });

  it('yields nothing for a vault without decisions', () => {
    expect(discoverDecisions(join(tmpdir(), 'teaman-no-such-dir'))).toEqual([]);
  });
});
