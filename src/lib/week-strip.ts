/**
 * Geometry of the daily week strip (components/daily/WeekStrip.tsx): where it
 * rests on load and how far its leading edge fades. Pure numbers in, so the
 * rules are testable without a layout engine; `pad` is the strip's edge fade
 * width (its scroll padding).
 */

export interface StripRestInput {
  /** Each chip's left offset within the strip, in order. */
  chipLefts: number[];
  /** The current week's chip: left offset and width. */
  active: { left: number; width: number };
  /** The strip's visible width. */
  clientWidth: number;
  pad: number;
}

/**
 * The scroll offset the strip opens at: the current week centred, backed off
 * so a whole chip starts just past the leading fade (the fade then holds the
 * tail of the week before as a peek). A strip too narrow to also show the
 * week before leads with the current week instead of pushing it under the
 * far fade. The browser clamps the result to the scroll range.
 */
export function stripRestingLeft({ chipLefts, active, clientWidth, pad }: StripRestInput): number {
  const centred = active.left - clientWidth / 2 + active.width / 2;
  let start = chipLefts.reduce((left, chipLeft) => (chipLeft - pad <= centred ? chipLeft - pad : left), 0);
  if (active.left + active.width > start + clientWidth - pad) start = active.left - pad;
  return Math.max(0, start);
}

/**
 * Length of the leading fade. A chip at rest starts `fade` in, so the fade
 * holds only the previous week's tail. Where it cannot rest there — the strip
 * clamped at its newest end — the first whole chip (`edge` px in) sits
 * nearer the edge and that tail shrinks to a sliver, so the fade reaches on
 * into the chip by what the peek lost and the edge still reads as "more".
 */
export function stripLeadingFade(fade: number, edge: number): number {
  return fade + Math.max(0, fade - edge);
}
