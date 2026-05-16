import { getCollection, type CollectionEntry } from 'astro:content';
import { wordCount } from './text';

const base = import.meta.env.BASE_URL;

export interface DailyEntry {
  /** ISO date string `YYYY-MM-DD` */
  date: string;
  weekday: WeekdayShort;
  tags: string[];
  /** Word count of the markdown body. */
  words: number;
  /** Underlying collection entry — kept so callers can `render(entry)`. */
  entry: CollectionEntry<'dailies'>;
}

export type WeekdayShort = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export const WEEKDAY_LONG: Record<WeekdayShort, string> = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** Weeks are Sunday-anchored: index 0 = Sunday … 6 = Saturday. */
const SHORT_FROM_INDEX: WeekdayShort[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Single-letter weekday headers used by the archive date picker (Sunday-first). */
export const WEEKDAY_INITIALS: readonly string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface DailyWeek {
  /** Stable id = ISO date of the week's Sunday. Doubles as the URL slug. */
  id: string;
  /** ISO Sunday date `YYYY-MM-DD` (first day). */
  start: string;
  /** ISO Saturday date `YYYY-MM-DD` (last day). */
  end: string;
  days: DailyEntry[];
  /** Total words across every daily in the week. */
  totalWords: number;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dailyDateId(entry: CollectionEntry<'dailies'>): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.id)) return entry.id;
  return isoDate(entry.data.date as Date);
}

function dateFromIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Sunday of the week containing `d`, in local time. */
export function sundayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export async function loadDailyEntries(): Promise<DailyEntry[]> {
  const dailies = await getCollection('dailies');
  return dailies
    .filter(d => !d.data.draft)
    .map(d => {
      const date = dailyDateId(d);
      const localDate = dateFromIsoDate(date);
      return {
        date,
        weekday: SHORT_FROM_INDEX[localDate.getDay()],
        tags: d.data.tags ?? [],
        words: wordCount((d.body ?? '') as string),
        entry: d,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupByWeek(entries: DailyEntry[]): DailyWeek[] {
  const bySunday = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    const d = dateFromIsoDate(e.date);
    const key = isoDate(sundayOf(d));
    const list = bySunday.get(key) ?? [];
    list.push(e);
    bySunday.set(key, list);
  }
  return [...bySunday.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([sundayIso, days]) => {
      const sunday = dateFromIsoDate(sundayIso);
      const saturday = addDays(sunday, 6);
      return {
        id: sundayIso,
        start: sundayIso,
        end: isoDate(saturday),
        days: days.slice().sort((a, b) => a.date.localeCompare(b.date)),
        totalWords: days.reduce((n, d) => n + d.words, 0),
      };
    });
}

export async function loadDailyWeeks(): Promise<DailyWeek[]> {
  const entries = await loadDailyEntries();
  return groupByWeek(entries);
}

/** Path to the daily page for a given week, including `BASE_URL`. */
export function weekHref(week: { id: string }): string {
  return `${base}daily/${week.id}/`;
}

/** Anchor id for a day inside a week page. */
export function dayAnchor(date: string): string {
  return `day-${date}`;
}
