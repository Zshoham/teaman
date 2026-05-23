import { useMemo, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  WEEKDAY_INITIALS,
  addDays,
  isoDate,
  sundayOf,
  weekHref,
  type DailyWeekShape,
} from "@/lib/dailies-shared";

interface Props {
  weeks: DailyWeekShape[];
  currentId: string;
}

interface MonthView {
  key: string; // 'YYYY-MM'
  year: number;
  month: number;
  label: string;
  rows: Array<{
    sundayIso: string;
    days: Array<{ day: number; inMonth: boolean }>;
    week: DailyWeekShape | null;
    active: boolean;
  }>;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString("en-US", { month: "long" }).toLowerCase();
}

function buildMonth(
  year: number,
  month: number,
  bySunday: Record<string, DailyWeekShape>,
  currentId: string,
): MonthView {
  const first = new Date(year, month, 1);
  const start = sundayOf(first);
  const rows: MonthView["rows"] = [];
  let cursor = start;
  for (let r = 0; r < 6; r++) {
    const sundayIso = isoDate(cursor);
    const days: Array<{ day: number; inMonth: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(cursor, i);
      days.push({ day: d.getDate(), inMonth: d.getMonth() === month });
    }
    const week = bySunday[sundayIso] ?? null;
    rows.push({
      sundayIso,
      days,
      week,
      active: !!week && week.id === currentId,
    });
    cursor = addDays(cursor, 7);
    if (cursor.getMonth() !== month && r >= 3) break;
  }
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    year,
    month,
    label: monthLabel(year, month),
    rows,
  };
}

const rowGrid = "grid grid-cols-[24px_repeat(7,1fr)_16px] items-center gap-1 text-center";

export function DatePicker({ weeks, currentId }: Props) {
  const [open, setOpen] = useState(false);

  const { months, initialKey } = useMemo(() => {
    const bySunday: Record<string, DailyWeekShape> = Object.fromEntries(
      weeks.map((w) => [w.start, w]),
    );
    const sorted = weeks.slice().sort((a, b) => a.start.localeCompare(b.start));
    const earliest = new Date(`${sorted[0]?.start ?? isoDate(new Date())}T00:00:00`);
    const latest = new Date(
      `${sorted[sorted.length - 1]?.start ?? isoDate(new Date())}T00:00:00`,
    );
    const months: MonthView[] = [];
    let y = earliest.getFullYear();
    let m = earliest.getMonth();
    while (y < latest.getFullYear() || (y === latest.getFullYear() && m <= latest.getMonth())) {
      months.push(buildMonth(y, m, bySunday, currentId));
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    const currentWeek = weeks.find((w) => w.id === currentId) ?? weeks[0];
    const currentDate = new Date(`${currentWeek.start}T00:00:00`);
    const initialKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
    return { months, initialKey };
  }, [weeks, currentId]);

  const [activeKey, setActiveKey] = useState(initialKey);
  const activeIdx = months.findIndex((m) => m.key === activeKey);
  const active = months[activeIdx] ?? months[0];
  const atMin = activeIdx <= 0;
  const atMax = activeIdx >= months.length - 1;

  const goPrev = () => {
    if (!atMin) setActiveKey(months[activeIdx - 1].key);
  };
  const goNext = () => {
    if (!atMax) setActiveKey(months[activeIdx + 1].key);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-auto min-w-[38px] px-3 [&_svg:not([class*='size-'])]:size-3.5"
            title="jump to a week"
            aria-label="Open week archive"
            data-archive-toggle
          >
            <CalendarIcon aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-[308px] p-3.5"
        aria-label="Pick a week"
        data-archive-popover
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goPrev}
            disabled={atMin}
            aria-label="Previous month"
            data-archive-prev
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <div className="month-label flex-1 text-center font-mono text-[12px] tabular-nums uppercase tracking-[0.08em] text-foreground">
            {active.label}
            <span className="ml-2 text-faint">{active.year}</span>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={goNext}
            disabled={atMax}
            aria-label="Next month"
            data-archive-next
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>

        <div className={`${rowGrid} mb-1.5`}>
          <span />
          {WEEKDAY_INITIALS.map((d, i) => (
            <span key={i} className="font-mono text-[10px] tracking-[0.08em] text-faint">
              {d}
            </span>
          ))}
          <span />
        </div>

        <div className="month flex flex-col gap-0.5">
          {active.rows.map((row) => {
            const monthIso = String(active.month + 1).padStart(2, "0");
            const hasNotes = !!row.week;
            const cls = cn(
              rowGrid,
              "rounded py-1 outline outline-transparent transition-colors",
              row.active && "bg-muted outline-foreground",
              hasNotes ? "hover:bg-muted" : "cursor-default",
            );
            if (hasNotes && row.week) {
              return (
                <a
                  key={row.sundayIso}
                  className={cls}
                  href={weekHref(row.week)}
                  title={`jump to week of ${row.sundayIso}`}
                >
                  <span className="tabular-nums font-mono text-[9px] text-faint">{monthIso}</span>
                  {row.days.map((d, di) => (
                    <span
                      key={di}
                      className={cn(
                        "tabular-nums font-mono py-1 text-[12px]",
                        d.inMonth ? "text-foreground" : "text-muted-foreground opacity-55",
                      )}
                    >
                      {d.day}
                    </span>
                  ))}
                  <span
                    className="row-dot-on inline-block size-[5px] justify-self-center rounded-full bg-primary/90"
                    aria-hidden="true"
                  />
                </a>
              );
            }
            return (
              <span key={row.sundayIso} className={cls}>
                <span className="tabular-nums font-mono text-[9px] text-faint">{monthIso}</span>
                {row.days.map((d, di) => (
                  <span
                    key={di}
                    className="tabular-nums font-mono py-1 text-[12px] text-faint opacity-55"
                  >
                    {d.day}
                  </span>
                ))}
                <span
                  className="inline-block size-[5px] justify-self-center rounded-full bg-transparent"
                  aria-hidden="true"
                />
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 font-mono text-[10px] tracking-[0.08em] text-faint">
          <span className="uppercase">pick a week</span>
          <span className="inline-flex items-center">
            <span
              className="mr-1.5 inline-block size-[5px] rounded-full bg-primary/90 align-middle"
              aria-hidden="true"
            />
            has notes
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
