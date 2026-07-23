import type { ReactNode } from 'react';
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
}: Props<T>) {
  const handleChange = (next: Filter<T>[]) => {
    onChange(coalesceFilterRules(next));
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          'sticky top-[var(--header-h)] z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background py-3 max-[760px]:static max-[760px]:items-stretch',
          className,
        )}
        data-filter-toolbar
      >
        <ScrollArea
          className="min-w-0 max-w-full max-[760px]:w-full"
          data-filter-scroll
        >
          <Filters
            className="max-[760px]:w-max max-[760px]:flex-nowrap max-[760px]:pr-px"
            size="sm"
            filters={filters}
            fields={fields}
            onChange={handleChange}
            allowMultiple
            showSearchInput
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="font-mono text-meta uppercase tracking-label-sm"
              >
                <ListFilterIcon aria-hidden="true" />
                Filter
              </Button>
            }
          />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

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
