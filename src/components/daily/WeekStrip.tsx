import { useEffect, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { weekHref, type DailyWeekShape } from "@/lib/dailies-shared";
import { fmtDayRange, fmtWeeksAgo } from "@/lib/format";
import { DatePicker } from "./DatePicker";

interface Props {
  weeks: DailyWeekShape[];
  currentId: string;
}

export function WeekStrip({ weeks, currentId }: Props) {
  const currentIdx = weeks.findIndex((w) => w.id === currentId);
  const prev = currentIdx >= 0 && currentIdx < weeks.length - 1 ? weeks[currentIdx + 1] : null;
  const next = currentIdx > 0 ? weeks[currentIdx - 1] : null;

  // `weeks` is newest-first (consumed that way elsewhere). The strip renders
  // oldest → newest left-to-right so the chevron directions match the visual
  // motion: left = older = leftward; right = newer = rightward.
  const chipWeeks = weeks.slice().reverse();

  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const active = activeRef.current;
    if (!strip || !active) return;
    const target = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "instant" as ScrollBehavior });
  }, []);

  const navCls =
    "inline-flex h-auto min-w-[38px] items-center justify-center rounded-md border border-border bg-transparent px-3 text-foreground no-underline transition-colors hover:border-foreground hover:bg-muted md:px-3.5";

  return (
    <nav className="sticky top-[var(--header-h)] z-[8] border-b border-border bg-background py-3" aria-label="Week navigation" data-week-strip>
      <div className="flex items-stretch gap-2.5">
        {prev ? (
          <a
            className={navCls}
            href={weekHref(prev)}
            title={`previous week — ${fmtDayRange(prev.start, prev.end)}`}
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <span className={cn(navCls, "pointer-events-none cursor-default text-faint")} aria-hidden="true">
            <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
          </span>
        )}

        <div
          ref={stripRef}
          data-strip-chips
          className="week-strip-chips flex min-w-0 flex-1 snap-x items-stretch gap-2 overflow-x-auto scroll-smooth"
        >
          {chipWeeks.map((w) => {
            const active = w.id === currentId;
            const range = fmtDayRange(w.start, w.end);
            return (
              <a
                key={w.id}
                ref={active ? activeRef : undefined}
                className={cn(
                  "flex shrink-0 snap-center items-baseline gap-2 rounded-md border bg-transparent px-3.5 py-2 whitespace-nowrap text-foreground no-underline transition-colors",
                  active ? "border-primary" : "border-border hover:border-foreground hover:bg-muted",
                )}
                href={weekHref(w)}
                data-week={w.id}
                data-current={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
              >
                <span className="tabular-nums font-mono text-meta-lg text-inherit">{range}</span>
                <span className="tabular-nums font-mono text-meta-sm text-faint">{fmtWeeksAgo(w.start)}</span>
              </a>
            );
          })}
        </div>

        {next ? (
          <a
            className={navCls}
            href={weekHref(next)}
            title={`next week — ${fmtDayRange(next.start, next.end)}`}
            aria-label="Next week"
          >
            <ChevronRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <span className={cn(navCls, "pointer-events-none cursor-default text-faint")} aria-hidden="true">
            <ChevronRightIcon className="size-3.5" aria-hidden="true" />
          </span>
        )}

        <DatePicker weeks={weeks} currentId={currentId} triggerClassName={navCls} />
      </div>
    </nav>
  );
}
