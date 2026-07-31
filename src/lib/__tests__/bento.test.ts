import { describe, it, expect } from 'vitest';
import { computeLayout, BENTO_GRID_COLS } from '../bento';
import type { BentoCard, BentoTile } from '../bento';

/**
 * Split the cards into rows the way the CSS grid does: a card that no longer
 * fits starts the next row. Closing on `>=` rather than `===` matters — an
 * over-wide row has to surface as a row summing to 7+, not silently swallow
 * the cards behind it.
 */
function rows(cards: BentoCard[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  for (const c of cards) {
    cur.push(c.cols);
    sum += c.cols;
    if (sum >= BENTO_GRID_COLS) {
      out.push(cur);
      cur = [];
      sum = 0;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

const bare = (n: number): BentoTile[] => Array.from({ length: n }, (_, i) => ({ label: `l${i}` }));
const rich = (label = 'rich'): BentoTile => ({ label, description: 'x'.repeat(120) });
const mid = (label: string): BentoTile => ({ label, description: 'a description of middling length' });

describe('computeLayout', () => {
  it('returns nothing for no links', () => {
    expect(computeLayout([])).toEqual({ cards: [], chips: [] });
  });

  it('gives a single rich link the full row', () => {
    const { cards, chips } = computeLayout([rich('solo')]);
    expect(chips).toEqual([]);
    expect(cards).toEqual([{ link: 0, cols: BENTO_GRID_COLS, treatment: 'feature' }]);
  });

  it('every row sums to exactly BENTO_GRID_COLS (no empty cells)', () => {
    const cases: BentoTile[][] = [
      [rich(), mid('a'), mid('b')],
      Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, description: 'x'.repeat(20 + i * 30) })),
      Array.from({ length: 7 }, (_, i) => ({ label: `link number ${i}`, description: 'x'.repeat(i * 20) })),
      Array.from({ length: 11 }, (_, i) => ({ label: `l${i}`, description: i % 3 === 0 ? 'x'.repeat(90) : undefined })),
      [rich(), ...bare(4), mid('m'), ...bare(3)],
      Array.from({ length: 13 }, (_, i) => ({ label: `l${i}`, description: 'x'.repeat(120 - i) })),
      // The feature last (and next-to-last): orphan control pulls a card into
      // the tail row, and a tail that already holds the wide feature has no
      // columns to spare — pulling by card count alone overfilled it.
      ...[2, 5, 8, 11, 14].flatMap((n) => [
        [...Array.from({ length: n - 1 }, (_, i) => mid(`m${i}`)), rich()],
        [...Array.from({ length: n - 2 }, (_, i) => mid(`m${i}`)), rich(), mid('tail')],
      ]),
    ];
    for (const links of cases) {
      const { cards, chips } = computeLayout(links);
      expect(cards.every((c) => c.cols >= 1 && c.cols <= BENTO_GRID_COLS)).toBe(true);
      const r = rows(cards);
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(row.reduce((a, b) => a + b, 0)).toBe(BENTO_GRID_COLS);
      // every card landed in a row, and every link is placed exactly once
      expect(r.flat()).toHaveLength(cards.length);
      expect([...cards.map((c) => c.link), ...chips].sort((a, z) => a - z)).toEqual(
        links.map((_, i) => i),
      );
    }
  });

  it('keeps cards and chips in config order', () => {
    const { cards, chips } = computeLayout([{ label: 'a' }, rich(), { label: 'b' }, mid('c'), { label: 'd' }]);
    expect(cards.map((c) => c.link)).toEqual([1, 3]);
    expect(chips).toEqual([0, 2, 4]);
  });

  it('gives a richer card more columns than a plainer one', () => {
    // Two cards alone each take a full row, so the comparison needs three.
    const { cards } = computeLayout([rich('big'), mid('med'), mid('med2'), ...bare(3)]);
    expect(cards[0].cols).toBeGreaterThan(cards[1].cols);
  });

  it('compresses the feature as the card count grows', () => {
    const at3 = computeLayout([rich(), mid('a'), mid('b')]).cards;
    const at12 = computeLayout([rich(), ...Array.from({ length: 11 }, (_, i) => mid(`m${i}`))]).cards;
    expect(at12[0].cols).toBeLessThanOrEqual(at3[0].cols);
  });

  it('matches the documented example-set shape', () => {
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
    const { cards, chips } = computeLayout(links);
    // every described link gets a card — including `docs`, whose description is
    // short but real; only the bare labels go to the strip
    expect(cards.map((c) => c.link)).toEqual([0, 1, 2, 5]);
    expect(chips).toEqual([3, 4, 6, 7]);
    expect(cards[0].treatment).toBe('feature');
    for (const row of rows(cards)) {
      expect(row.reduce((a, b) => a + b, 0)).toBe(BENTO_GRID_COLS);
    }
    expect(cards[0].cols).toBeGreaterThanOrEqual(cards[1].cols);
  });
});

describe('computeLayout treatments', () => {
  it('features the first lg link and only that one', () => {
    const { cards } = computeLayout([...bare(2), rich('a'), rich('b'), ...bare(4)]);
    const featured = cards.filter((c) => c.treatment === 'feature');
    expect(featured).toHaveLength(1);
    expect(featured[0].link).toBe(2);
    expect(cards.find((c) => c.link === 3)?.treatment).toBe('mid');
  });

  it('promotes the richest md link when none is lg', () => {
    const { cards } = computeLayout([
      { label: 'a' },
      { label: 'b', description: 'a short description of some kind' },
      { label: 'c', description: 'a rather longer description than the other' },
      { label: 'd' },
    ]);
    const featured = cards.filter((c) => c.treatment === 'feature');
    expect(featured).toHaveLength(1);
    expect(featured[0].link).toBe(2);
    expect(cards.find((c) => c.link === 1)?.treatment).toBe('mid');
  });

  it('renders an all-bare link set as chips only, with no grid', () => {
    const { cards, chips } = computeLayout(bare(8));
    expect(cards).toEqual([]);
    expect(chips).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('never puts a link with no description in a card', () => {
    const cases = [bare(1), bare(4), [rich(), ...bare(6)], [...bare(3), rich(), ...bare(3)], [mid('a'), ...bare(2)]];
    for (const links of cases) {
      const { cards } = computeLayout(links);
      for (const card of cards) expect(links[card.link].description).toBeTruthy();
    }
  });

  it('cards a link whose description is short but real', () => {
    // A chip shows the label alone, so demoting a described link on a length
    // threshold would drop its description off the page entirely.
    const { cards, chips } = computeLayout([rich(), { label: 'docs', description: 'short.' }, ...bare(2)]);
    expect(cards.map((c) => c.link)).toEqual([0, 1]);
    expect(chips).toEqual([2, 3]);
  });

  it('keeps the feature wider than every mid sharing its row', () => {
    // At the crowded bucket the feature leads a mid by one column, so the row's
    // leftover column must not go to the mid and tie them.
    for (let n = 2; n <= 16; n++) {
      const { cards } = computeLayout([rich(), ...Array.from({ length: n - 1 }, (_, i) => mid(`m${i}`))]);
      // the feature leads, so its row is the first one
      const [featureRow] = rows(cards);
      for (const cols of featureRow.slice(1)) expect(cols, `${n} cards`).toBeLessThan(featureRow[0]);
    }
  });

  it('never strands a lone stretched card in a middle row', () => {
    // Orphan control pulls cards down into a thin last row; pulling too far
    // used to empty the row above (Infinity spans) or leave it holding one
    // card stretched across the whole grid. Only the feature may sit alone.
    for (let n = 3; n <= 16; n++) {
      const { cards } = computeLayout([rich(), ...Array.from({ length: n - 1 }, (_, i) => mid(`m${i}`))]);
      expect(cards.every((c) => Number.isInteger(c.cols))).toBe(true);
      rows(cards).forEach((row, i) => {
        if (row.length === 1) {
          expect(i, `row ${i} of ${n} cards holds one card`).toBe(0);
          expect(cards[0].treatment).toBe('feature');
        }
      });
    }
  });

  it('keeps the feature wide enough to carry a heading', () => {
    for (const n of [3, 4, 6, 8, 12, 20]) {
      const { cards } = computeLayout([rich(), ...Array.from({ length: n - 1 }, (_, i) => mid(`m${i}`))]);
      expect(cards[0].treatment).toBe('feature');
      expect(cards[0].cols).toBeGreaterThanOrEqual(3);
    }
  });
});
