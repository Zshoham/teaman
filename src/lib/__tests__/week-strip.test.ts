import { describe, expect, it } from 'vitest';

import { stripLeadingFade, stripRestingLeft } from '../week-strip';

// Seven 147px chips, 8px apart — the strip's real geometry at 1440px.
const chipLefts = Array.from({ length: 7 }, (_, i) => i * 155);
const chip = (i: number) => ({ left: chipLefts[i], width: 147 });

describe('stripRestingLeft', () => {
  it('rests a whole chip one fade-width in, the current week near the centre', () => {
    const left = stripRestingLeft({ chipLefts, active: chip(4), clientWidth: 600, pad: 40 });
    expect(chipLefts.map((l) => l - left)).toContain(40);
    expect(chipLefts[4] - left).toBeGreaterThan(40);
    expect(chipLefts[4] + 147 - left).toBeLessThanOrEqual(600 - 40);
  });

  it('opens at the start for the oldest week', () => {
    expect(stripRestingLeft({ chipLefts, active: chip(0), clientWidth: 600, pad: 40 })).toBe(0);
  });

  it('leads with the current week when the strip cannot also show the one before', () => {
    const left = stripRestingLeft({ chipLefts, active: chip(4), clientWidth: 292, pad: 40 });
    expect(left).toBe(chipLefts[4] - 40);
  });
});

describe('stripLeadingFade', () => {
  it('stays one fade-width while the first whole chip rests past the fade', () => {
    expect(stripLeadingFade(40, 40)).toBe(40);
    expect(stripLeadingFade(40, 120)).toBe(40);
  });

  it('reaches into a chip that sits too near the edge for a peek', () => {
    expect(stripLeadingFade(40, 16)).toBe(64);
    expect(stripLeadingFade(40, 0)).toBe(80);
  });
});
