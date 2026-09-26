/**
 * Pure utilities + shared types for the daily-notes feature.
 *
 * This file deliberately avoids `astro:content` so it can be imported by
 * client-side React components (WeekStrip, DatePicker). Server-only loading
 * lives next door in `dailies.ts`.
 */

import { dailyIsoDate, weekHref as weekHrefFor } from './entry-identity.mjs';

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

export { dateFromIsoDate, dayAnchor, localIsoDate, sundayOf } from './entry-identity.mjs';

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Path to the daily page for a given week, including `BASE_URL`. */
export function weekHref(week: { id: string }): string {
  return weekHrefFor(base, week.id);
}

/** The ISO date a daily note is filed under — see `dailyIsoDate`. */
export function dailyDateId(entry: { id: string; data: { date: Date } }): string {
  return dailyIsoDate(entry.id, entry.data.date);
}
