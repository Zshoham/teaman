import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

interface FilterTab {
  id: string;
  label: string;
  count: number;
}

interface Props {
  filterTabs: FilterTab[];
  defaultFilter?: string;
}

export function FilterBar({ filterTabs, defaultFilter = "all" }: Props) {
  return (
    <div className="sticky top-[var(--header-h)] z-[5] -mx-px mb-1 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background py-3">
      <div className="flex flex-wrap gap-1.5" data-filter-pills>
        {filterTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              toggleVariants({ variant: "outline", size: "sm" }),
              "rounded-full gap-2 text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:border-foreground",
            )}
            data-filter={t.id}
            aria-pressed={t.id === defaultFilter ? "true" : "false"}
          >
            <span>{t.label}</span>
            <span className="font-mono text-meta-sm opacity-60">{t.count}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 border-b border-primary bg-transparent py-0.5 font-mono text-meta text-foreground hover:text-primary"
        data-sort-toggle
        aria-label="Sort: newest first"
      >
        date <span className="sort-arrow" aria-hidden="true">↓</span>
      </button>
    </div>
  );
}
