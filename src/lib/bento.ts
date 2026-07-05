// Auto-layout for the home-page quick-links bento grid. Pure function: given
// the link content (label + optional description), decide each tile's column
// span on the 6-col desktop grid — without any per-tile config. The richer a
// tile's content relative to its siblings, the more grid space it gets; the
// total link count sets the density bucket so a few links spread big and many
// links pack tight. The layout always fills the grid exactly: tiles are placed
// in config order at a content-tier target width, and whenever a row would
// overflow, the current row is closed by widening its widest tile to eat the
// remainder — so every row sums to BENTO_GRID_COLS and there are no empty
// cells. (Dense CSS packing only backfills; this guarantees fill.)

export interface BentoTile {
  label: string;
  description?: string;
}

export interface BentoCell {
  /** Column span on the 6-col desktop grid (always 1..BENTO_GRID_COLS). */
  cols: number;
}

export const BENTO_GRID_COLS = 6;

/**
 * Content richness tier — drives the target column width before fill
 * adjustment. Description length dominates; a long label adds a little so a
 * bare-link tile with a very long name still gets a touch more width.
 */
type Tier = 'sm' | 'md' | 'lg';

function score(l: BentoTile): number {
  let s = l.description?.length ?? 0;
  if (l.label.length > 20) s += 15;
  else if (l.label.length > 12) s += 8;
  return s;
}

function tierOf(s: number): Tier {
  if (s >= 80) return 'lg'; // a real description (≥~80 chars combined)
  if (s >= 25) return 'md'; // a short description or a long label
  return 'sm'; // bare label or near-bare
}

// Per-density-bucket target span for each tier. Index = bucket(n):
//   0: ≤2   1: 3   2: 4   3: 5-6   4: 7-8   5: ≥9
// Few links → wide tiles (everything full-width at n≤2); many links → mostly
// 1-col tiles. Targets stay within {1,2,3,6} so rows combine cleanly toward 6;
// any remainder is closed by widening the row's widest tile (see computeLayout).
const TARGETS: Record<Tier, number[]> = {
  sm: [6, 1, 1, 1, 1, 1],
  md: [6, 2, 2, 2, 2, 1],
  lg: [6, 3, 3, 2, 2, 2],
};

function bucket(n: number): number {
  if (n <= 2) return 0;
  if (n === 3) return 1;
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 5;
}

/**
 * Compute a bento layout for the given tiles. The result is index-aligned with
 * the input and every consecutive run of cells that forms a row sums to
 * exactly `BENTO_GRID_COLS` — the grid never leaves an empty cell. Returns
 * `[]` for no tiles.
 */
export function computeLayout(links: BentoTile[]): BentoCell[] {
  const n = links.length;
  if (n === 0) return [];
  const b = bucket(n);
  const scores = links.map(score);

  const result: BentoCell[] = [];
  let row: number[] = [];   // tentative col spans for the current row
  let rowSum = 0;

  // Close the current row: widen its widest tile (ties → first) by the deficit
  // so the row sums to exactly BENTO_GRID_COLS, then emit the cells in order.
  const flush = () => {
    if (row.length === 0) return;
    const deficit = BENTO_GRID_COLS - rowSum;
    if (deficit > 0) {
      let maxIdx = 0;
      for (let j = 1; j < row.length; j++) if (row[j] > row[maxIdx]) maxIdx = j;
      row[maxIdx] += deficit;
    }
    for (const cols of row) result.push({ cols });
    row = [];
    rowSum = 0;
  };

  for (let i = 0; i < n; i++) {
    const target = TARGETS[tierOf(scores[i])][b];
    if (row.length > 0 && rowSum + target > BENTO_GRID_COLS) flush();
    row.push(target);
    rowSum += target;
    if (rowSum === BENTO_GRID_COLS) flush();
  }
  flush();

  return result;
}
