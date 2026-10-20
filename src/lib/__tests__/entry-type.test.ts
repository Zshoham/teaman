import { describe, expect, it } from 'vitest';
import { COLLECTIONS, type EntryType } from '../collections.mjs';

// `EntryType` is written out by hand in collections.d.mts. TypeScript holds
// this literal to the union in both directions (a missing type is an error,
// an unknown one is an excess property), and the test holds it to the
// registry, so the union cannot drift from `COLLECTIONS`.
const EVERY_TYPE: Record<EntryType, true> = {
  note: true,
  reference: true,
  daily: true,
  guide: true,
  slides: true,
  decision: true,
};

describe('EntryType', () => {
  it('names exactly the registry types', () => {
    expect(Object.keys(EVERY_TYPE).sort()).toEqual(COLLECTIONS.map(c => c.type).sort());
  });
});
