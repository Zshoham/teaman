import { getCollection, type CollectionEntry } from 'astro:content';
import { wordCount } from './text';
import {
  SHORT_FROM_INDEX,
  addDays,
  isoDate,
  sundayOf,
  type WeekdayShort,
} from './dailies-shared';

export {
  WEEKDAY_LONG,
  WEEKDAY_INITIALS,
  isoDate,
  sundayOf,
  addDays,
  weekHref,
  dayAnchor,
  type WeekdayShort,
} from './dailies-shared';

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

function dailyDateId(entry: CollectionEntry<'dailies'>): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.id)) return entry.id;
  return isoDate(entry.data.date as Date);
}

function dateFromIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
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
