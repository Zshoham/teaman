// Auto-layout for the home-page quick-links block. Pure function: given the
// link content (label + optional description), decide which links earn a card
// in the bento grid, how wide each card is, and which treatment it renders in
// — without any per-tile config.
//
// Only links carrying a description get a card. A bare label has nothing to
// put in one, and stretching it to a grid cell produced the worst tiles on the
// page, so those links leave the grid entirely: they come back as `chips`, for
// the component to render as a compact strip *below* the grid. The grid then
// contains cards and nothing else, and no cell has to be padded out to match a
// neighbour's height.
//
// Among the cards, the richest one is featured — more grid space and a louder
// treatment; the rest are peers. The card count sets the density bucket, so a
// few cards spread big and many cards pack tight. The grid always fills
// exactly: cards are placed in config order at a target width, and whenever a
// row would overflow, the current row is closed by widening its cards to eat
// the remainder — so every row sums to BENTO_GRID_COLS and there are no empty
// cells. (Dense CSS packing only backfills; this guarantees fill.)

export interface BentoTile {
  label: string;
  description?: string;
}

/**
 * How a card is skinned (see the `.quick-link-*` rules in global.css):
 * - `feature` — exactly one per grid: the richest link, with its icon blown up
 *   as a ghost watermark and the destination as a mono kicker.
 * - `mid` — a card: label, description, a smaller watermark.
 */
export type BentoTreatment = 'feature' | 'mid';

export interface BentoCard {
  /** Index into the input array. */
  link: number;
  /** Column span on the 6-col desktop grid (always 1..BENTO_GRID_COLS). */
  cols: number;
  treatment: BentoTreatment;
}

export interface BentoLayout {
  /** Cards in visual order; every row sums to exactly BENTO_GRID_COLS. */
  cards: BentoCard[];
  /** Indexes of the links that get no card, in config order. */
  chips: number[];
}

export const BENTO_GRID_COLS = 6;

/**
 * Content richness — only used to pick the feature. Every other carded link
 * gets the same `mid` treatment, so this ranks rather than tiers: description
 * length dominates, and a long label adds a little so a link with a very long
 * name outranks an equally described one with a terse name.
 */
function score(l: BentoTile): number {
  let s = l.description?.length ?? 0;
  if (l.label.length > 20) s += 15;
  else if (l.label.length > 12) s += 8;
  return s;
}

/** Score at which a link is rich enough (≈ a real description) to feature. */
const FEATURE_SCORE = 80;

// Per-density-bucket target span for each treatment. Index = bucket(cards):
//   0: ≤2   1: 3   2: 4   3: 5-6   4: 7-8   5: ≥9
// A couple of cards go full width; past that the feature holds 4 columns and
// only compresses to 3 once the grid is crowded, since that treatment needs
// the width to carry a heading and a description.
const TARGETS: Record<BentoTreatment, number[]> = {
  feature: [6, 4, 4, 4, 4, 3],
  mid: [6, 2, 2, 2, 2, 2],
};

/** Cards the last row wants before it is left to stretch (see orphan control). */
const MIN_TAIL_CARDS = 3;

function bucket(n: number): number {
  if (n <= 2) return 0;
  if (n === 3) return 1;
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 5;
}

/**
 * Index of the carded link that gets the feature treatment.
 *
 * The first link clearing FEATURE_SCORE wins — config order is the vault's own
 * priority, so a later, slightly richer link doesn't jump the queue. When none
 * clears it the richest card is promoted instead, so a grid always has exactly
 * one feature. (A link set that is *all* bare labels has no grid at all: it
 * renders as one strip of chips, the honest rendering of a bookmark list, and
 * this is never called.)
 */
function pickFeature(scores: number[], carded: number[]): number {
  const rich = carded.find((i) => scores[i] >= FEATURE_SCORE);
  if (rich !== undefined) return rich;
  let best = carded[0];
  for (const i of carded) if (scores[i] > scores[best]) best = i;
  return best;
}

/**
 * Compute the quick-links layout. Cards come back in visual order with every
 * row summing to exactly `BENTO_GRID_COLS`; every other link comes back in
 * `chips`, in config order, for the strip below the grid.
 */
export function computeLayout(links: BentoTile[]): BentoLayout {
  if (links.length === 0) return { cards: [], chips: [] };

  // 1. Split the links: a description is the whole test. Anything softer (a
  //    length threshold, say) drops a real description on the floor, since a
  //    chip renders the label alone.
  const carded: number[] = [];
  const chips: number[] = [];
  links.forEach((l, i) => {
    if (l.description) carded.push(i);
    else chips.push(i);
  });
  if (carded.length === 0) return { cards: [], chips };

  const scores = links.map(score);
  const featureIdx = pickFeature(scores, carded);
  const b = bucket(carded.length);
  const treatmentOf = (i: number): BentoTreatment => (i === featureIdx ? 'feature' : 'mid');
  const targets = new Map(carded.map((i) => [i, TARGETS[treatmentOf(i)][b]]));

  // 2. Pack cards into rows at their target widths, in config order.
  const packed: number[][] = [];
  let row: number[] = [];
  let rowSum = 0;
  for (const i of carded) {
    const target = targets.get(i)!;
    if (row.length > 0 && rowSum + target > BENTO_GRID_COLS) {
      packed.push(row);
      row = [];
      rowSum = 0;
    }
    row.push(i);
    rowSum += target;
    if (rowSum === BENTO_GRID_COLS) {
      packed.push(row);
      row = [];
      rowSum = 0;
    }
  }
  if (row.length > 0) packed.push(row);

  // 3. Orphan control. A thin last row gets stretched to fill the grid below —
  //    at the extreme, one card across six columns of dead space. Pull cards
  //    down from the row above while it keeps at least one, so the widening is
  //    shared out: three cards read better as a full-width feature over a pair
  //    than as a pair over one stretched card.
  //    The row above may be drained to a single card only when that card is
  //    the feature — a full-width feature banner is a shape the design wants,
  //    a lone stretched mid card in the middle of the grid is not.
  //    A card only comes down if the last row still has the columns to hold it
  //    at its target width: card count alone would overfill a row that is
  //    already full (a late feature packs as e.g. mid+feature = 6), and step 4
  //    can only ever *widen*, so an overfilled row would wrap and leave the
  //    hole this whole step exists to prevent.
  const last = packed[packed.length - 1];
  const prev = packed[packed.length - 2];
  const canSpare = (r: number[]) => r.length >= 3 || (r.length === 2 && r[0] === featureIdx);
  const width = (r: number[]) => r.reduce((a, i) => a + targets.get(i)!, 0);
  if (last && prev) {
    while (
      last.length < MIN_TAIL_CARDS &&
      canSpare(prev) &&
      width(last) + targets.get(prev[prev.length - 1])! <= BENTO_GRID_COLS
    ) {
      last.unshift(prev.pop()!);
    }
  }

  // 4. Close each row: spread its slack evenly so the row sums to exactly
  //    BENTO_GRID_COLS.
  const cards: BentoCard[] = [];
  for (const r of packed) {
    const cols = r.map((i) => targets.get(i)!);
    let slack = BENTO_GRID_COLS - cols.reduce((a, c) => a + c, 0);
    if (slack > 0) {
      const each = Math.floor(slack / cols.length);
      if (each > 0) {
        for (let j = 0; j < cols.length; j++) cols[j] += each;
        slack -= each * cols.length;
      }
      // Remaining columns (< row length) go one apiece to the *narrowest*
      // cards, ties broken leftward: that evens the row out instead of piling
      // slack onto a card that is already wide. No card may draw level with the
      // feature, though — in the crowded bucket it leads a mid by a single
      // column, and a row of feature-3 + mid-2 would otherwise hand that column
      // to the mid and render the two identically. Columns the guard blocks go
      // to the feature itself.
      const fpos = r.indexOf(featureIdx);
      const rank = cols.map((c, j) => ({ c, j })).sort((a, z) => a.c - z.c || a.j - z.j);
      // Rows without the feature have nothing to guard, so every card grows.
      const growable =
        fpos === -1 ? rank : rank.filter(({ j }) => j === fpos || cols[j] + 1 < cols[fpos]);
      let k = 0;
      for (; k < slack && k < growable.length; k++) cols[growable[k].j] += 1;
      if (k < slack && fpos !== -1) cols[fpos] += slack - k;
    }
    r.forEach((i, j) => cards.push({ link: i, cols: cols[j], treatment: treatmentOf(i) }));
  }

  return { cards, chips };
}
