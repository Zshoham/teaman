import { useEffect, useRef, type ReactNode } from 'react';
import { ListFilterIcon } from 'lucide-react';

import {
  Filters,
  type Filter,
  type FilterFieldConfig,
} from '@/components/reui/filters';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { coalesceFilterRules } from '@/lib/filter-rules';
import { cn } from '@/lib/utils';

interface Props<T extends string> {
  filters: Filter<T>[];
  fields: FilterFieldConfig<T>[];
  onChange: (filters: Filter<T>[]) => void;
  resultCount: number;
  totalCount: number;
  resultLabel: string;
  actions?: ReactNode;
  className?: string;
  /**
   * Whether a field can be added more than once. `false` also drops fields that
   * already have a chip from the add menu, which hides the trigger entirely
   * once every field is in use.
   */
  allowMultiple?: boolean;
}

/** Shared ReUI filtering surface for collection pages such as Home and ADRs. */
export function CollectionFilterBar<T extends string>({
  filters,
  fields,
  onChange,
  resultCount,
  totalCount,
  resultLabel,
  actions,
  className,
  allowMultiple = true,
}: Props<T>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const chipCount = useRef(filters.length);
  // Emptying a chip from its own picker removes the chip, and the menu closes
  // with no trigger left to hand focus back to: give it to the bar instead.
  useEffect(() => {
    const removed = filters.length < chipCount.current;
    chipCount.current = filters.length;
    const toolbar = toolbarRef.current;
    if (!removed || !toolbar || document.activeElement !== document.body) return;
    toolbar.querySelector<HTMLElement>('[data-filter-trigger], button')?.focus({ preventScroll: true });
  }, [filters.length]);

  const handleChange = (next: Filter<T>[]) => {
    onChange(coalesceFilterRules(next));
  };

  return (
    <TooltipProvider>
      <div
        ref={toolbarRef}
        className={cn(
          'sticky top-[var(--header-h)] z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background py-3 max-[760px]:static max-[760px]:items-stretch',
          className,
        )}
        data-filter-toolbar
      >
        {/* A collection with nothing to filter on (a guides-only list, which
            carries no tags) keeps the count + sort row and drops the trigger
            rather than opening an empty menu. The scrollport clips what
            overflows it, so it is padded by the focus ring's reach — and,
            narrow, where the chips scroll in one row, below by the overlay
            scrollbar's height so the bar runs under the chips rather than
            over them — cancelled by matching negative margins. */}
        {fields.length > 0 && (
        <ScrollArea
          className="-m-1 min-w-0 max-w-[calc(100%+0.5rem)] max-[760px]:-mb-3.5 max-[760px]:w-[calc(100%+0.5rem)]"
          data-filter-scroll
        >
          <Filters
            className="p-1 max-[760px]:w-max max-[760px]:flex-nowrap max-[760px]:pb-3.5"
            size="sm"
            filters={filters}
            fields={fields}
            onChange={handleChange}
            allowMultiple={allowMultiple}
            showSearchInput
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="font-mono text-meta uppercase tracking-label-sm"
                data-filter-trigger
              >
                <ListFilterIcon aria-hidden="true" />
                Filter
              </Button>
            }
          />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <div
            className="flex items-center gap-1 font-mono text-meta tabular-nums leading-snug text-faint"
            aria-live="polite"
          >
            <span>
              <b className="font-medium text-foreground">{resultCount}</b>{' '}
              of {totalCount} {resultLabel}
            </span>
          </div>
          {actions}
        </div>
      </div>
    </TooltipProvider>
  );
}
