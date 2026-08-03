/**
 * Pure utilities + shared types for the daily-notes feature.
 *
 * This file deliberately avoids `astro:content` so it can be imported by
 * client-side React components (WeekStrip, DatePicker). Server-only loading
 * lives next door in `dailies.ts`.
 */

import { isoDate } from './format';

const base = import.meta.env.BASE_URL;

export type WeekdayShort = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export const WEEKDAY_LONG: Record<WeekdayShort, string> = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** Single-letter weekday headers used by the archive date picker (Sunday-first). */
export const WEEKDAY_INITIALS: readonly string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Weeks are Sunday-anchored: index 0 = Sunday … 6 = Saturday. */
export const SHORT_FROM_INDEX: WeekdayShort[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface DailyWeekShape {
  id: string;
  start: string;
  end: string;
}

/**
 * Local-time ISO date (YYYY-MM-DD).
 *
 * Deliberately *not* `format.ts`'s `isoDate`, which is UTC. The two are not
 * interchangeable and the distinction is load-bearing, so the names differ:
 * - `localIsoDate` formats Dates built from local components (`sundayOf`,
 *   `addDays`, `new Date(y, m, d)`). Using the UTC one on those would, on a
 *   positive-offset build, render local midnight as the *previous* UTC day —
 *   rolling a week back and breaking the link to its `/daily/<sunday>/` page.
 * - `isoDate` formats Dates that came from frontmatter, which YAML parses as
 *   UTC midnight. Using this one on those slides the date back a day on any
 *   negative-offset build.
 */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A `YYYY-MM-DD` string as a local-midnight Date — the inverse of `localIsoDate`. */
export function dateFromIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Sunday of the week containing `d`, in local time. */
export function sundayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Path to the daily page for a given week, including `BASE_URL`. */
export function weekHref(week: { id: string }): string {
  return `${base}daily/${week.id}/`;
}

/** Anchor id for a day inside a week page. */
export function dayAnchor(date: string): string {
  return `day-${date}`;
}

/**
 * The ISO date a daily note is filed under. A `YYYY-MM-DD` filename supplies it
 * directly; anything else falls back to the required `date` frontmatter, which
 * YAML parses as UTC midnight — hence the UTC formatter, not `localIsoDate`.
 */
export function dailyDateId(entry: { id: string; data: { date: Date } }): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.id)) return entry.id;
  return isoDate(entry.data.date);
}
