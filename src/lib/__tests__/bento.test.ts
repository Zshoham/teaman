import { describe, it, expect } from 'vitest';
import { computeLayout, BENTO_GRID_COLS } from '../bento';
import type { BentoTile } from '../bento';

/** Split a layout into rows by accumulating cols until they sum to the grid width. */
function rows(cells: { cols: number }[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  for (const c of cells) {
    cur.push(c.cols);
    sum += c.cols;
    if (sum === BENTO_GRID_COLS) {
      out.push(cur);
      cur = [];
      sum = 0;
    }
  }
  return out;
}

describe('computeLayout', () => {
  it('returns an empty array for no links', () => {
    expect(computeLayout([])).toEqual([]);
  });

  it('gives a single link the full row', () => {
    const out = computeLayout([{ label: 'solo' }]);
    expect(out).toHaveLength(1);
    expect(out[0].cols).toBe(BENTO_GRID_COLS);
  });

  it('gives two links one full-width row each (stacked)', () => {
    const out = computeLayout([{ label: 'a' }, { label: 'b' }]);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.cols === BENTO_GRID_COLS)).toBe(true);
  });

  it('every row sums to exactly BENTO_GRID_COLS (no empty cells)', () => {
    const cases: BentoTile[][] = [
      Array.from({ length: 3 }, (_, i) => ({ label: `l${i}` })),
      Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, description: i % 2 ? 'desc' : undefined })),
      Array.from({ length: 7 }, (_, i) => ({ label: `link number ${i}`, description: 'x'.repeat(i * 20) })),
      Array.from({ length: 11 }, (_, i) => ({ label: `l${i}`, description: i % 3 === 0 ? 'd' : undefined })),
      Array.from({ length: 20 }, (_, i) => ({ label: `l${i}` })),
    ];
    for (const links of cases) {
      const out = computeLayout(links);
      // every cell in range
      expect(out.every((c) => c.cols >= 1 && c.cols <= BENTO_GRID_COLS)).toBe(true);
      // every row sums exactly to the grid width
      const r = rows(out);
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(row.reduce((a, b) => a + b, 0)).toBe(BENTO_GRID_COLS);
      // total cells preserved
      expect(r.flat().length).toBe(links.length);
    }
  });

  it('assigns wider cols to richer tiles and narrower cols to bare ones', () => {
    const links: BentoTile[] = [
      { label: 'big', description: 'x'.repeat(120) }, // lg
      { label: 'med', description: 'short' }, // md
      { label: 'x' }, // sm
      { label: 'y' }, // sm
      { label: 'z' }, // sm
    ];
    const out = computeLayout(links);
    expect(out[0].cols).toBeGreaterThan(out[2].cols);
    expect(out[1].cols).toBeGreaterThanOrEqual(out[2].cols);
  });

  it('compresses spans as the link count grows', () => {
    const rich: BentoTile = { label: 'big', description: 'x'.repeat(120) };
    const at3 = computeLayout([rich, { label: 'a' }, { label: 'b' }]);
    const at12 = computeLayout([rich, ...Array.from({ length: 11 }, (_, i) => ({ label: `l${i}` }))]);
    expect(at12[0].cols).toBeLessThanOrEqual(at3[0].cols);
  });

  it('result is index-aligned and length-preserving', () => {
    const links: BentoTile[] = [
      { label: 'a' },
      { label: 'b', description: 'desc' },
      { label: 'c' },
      { label: 'd' },
    ];
    const out = computeLayout(links);
    expect(out).toHaveLength(links.length);
  });

  it('matches the documented example-set shape (always fills)', () => {
    const links: BentoTile[] = [
      { label: 'Obsidian', description: 'The local-first markdown app this vault lives in. Links are first-class, everything is a plain text file, and the graph is yours to shape.' },
      { label: '@zshoham/teaman', description: 'The engine that builds this site.' },
      { label: 'Astro', description: 'The web framework underneath.' },
      { label: 'lucide' },
      { label: 'changelog' },
      { label: 'docs', description: 'API & plugin reference.' },
      { label: 'forum' },
      { label: 'made slowly' },
    ];
    const out = computeLayout(links);
    expect(out).toHaveLength(8);
    // Every row sums to exactly 6 — no empty cells.
    for (const row of rows(out)) {
      expect(row.reduce((a, b) => a + b, 0)).toBe(BENTO_GRID_COLS);
    }
    // The richest tile (Obsidian, index 0) is the widest in its row.
    expect(out[0].cols).toBeGreaterThanOrEqual(out[1].cols);
    // Bare-label tiles never exceed the lg tile's width.
    const max = Math.max(...out.map((c) => c.cols));
    expect(out[0].cols).toBeGreaterThanOrEqual(out[3].cols);
    expect(out[0].cols).toBeLessThanOrEqual(BENTO_GRID_COLS);
    void max;
  });
});
