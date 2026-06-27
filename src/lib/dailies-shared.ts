/**
 * Pure utilities + shared types for the daily-notes feature.
 *
 * This file deliberately avoids `astro:content` so it can be imported by
 * client-side React components (WeekStrip, DatePicker). Server-only loading
 * lives next door in `dailies.ts`.
 */

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

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
