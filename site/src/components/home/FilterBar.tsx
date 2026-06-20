import { FilterPill } from "@/components/FilterPill";

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
          <FilterPill
            key={t.id}
            data-filter={t.id}
            aria-pressed={t.id === defaultFilter ? "true" : "false"}
            count={t.count}
          >
            {t.label}
          </FilterPill>
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
