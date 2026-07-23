import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleDotIcon,
  GitCommitVerticalIcon,
  Rows3Icon,
  TagsIcon,
} from 'lucide-react';

import { CollectionFilterBar } from '@/components/CollectionFilterBar';
import { StatusBadge } from '@/components/StatusBadge';
import {
  type Filter,
  type FilterFieldConfig,
} from '@/components/reui/filters';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  adrMatchesRules,
  adrRelationLabel,
  adrRelations,
  byNum,
  groupByYear,
  primaryAdrRelation,
  statusColor,
  statusCounts,
  tagCounts,
  STATUS_LABEL,
  STATUS_ORDER,
  type AdrRelation,
  type AdrStatus,
} from '@/lib/adr-shared';
import { cn } from '@/lib/utils';
import { AdrDetailDialog } from './AdrDetailDialog';
import type { AdrView } from './types';
import { useAdrModalState } from './useAdrModalState';

type Layout = 'spine' | 'grouped';

const cardBase =
  'group block w-full cursor-pointer rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const statusDotClass: Record<AdrStatus, string> = {
  accepted: 'bg-[var(--st-accepted)]',
  proposed: 'bg-[var(--st-proposed)]',
  superseded: 'bg-[var(--st-superseded)]',
};

const groupedCell =
  'grid grid-cols-[124px_44px_1fr] max-[760px]:grid-cols-[16px_minmax(0,1fr)]';

function LineageBadge({ rel }: { rel: AdrRelation<AdrView> }) {
  const Arrow = rel.dir === 'r' ? ArrowRightIcon : ArrowLeftIcon;
  return (
    <span className="ml-auto inline-flex flex-none items-center gap-2 rounded-full border border-border bg-muted py-[5px] pr-3 pl-[9px] font-mono text-meta-sm leading-none">
      <Arrow
        aria-hidden="true"
        className="size-[13px] flex-none"
        style={{ color: statusColor(rel.target.status) }}
      />
      <span className="uppercase tracking-label-sm text-faint">
        {adrRelationLabel(rel, 'title')}
      </span>
      <span className="font-medium tabular-nums text-foreground">
        ADR-{rel.num}
      </span>
    </span>
  );
}

export function AdrTimeline({ adrs }: { adrs: AdrView[] }) {
  const [filters, setFilters] = useState<Filter<string>[]>([]);
  const [layout, setLayout] = useState<Layout>('spine');

  const lookup = useMemo(() => byNum(adrs), [adrs]);
  const { openNum, setOpenNum, shown } = useAdrModalState(lookup);
  const statusTotals = useMemo(() => statusCounts(adrs), [adrs]);
  const allTags = useMemo(() => tagCounts(adrs), [adrs]);
  const filterFields = useMemo<FilterFieldConfig<string>[]>(
    () => {
      const fields: FilterFieldConfig<string>[] = [
        {
          key: 'status',
          label: 'Status',
          icon: <CircleDotIcon className="size-3.5" aria-hidden="true" />,
          type: 'multiselect',
          searchable: true,
          defaultOperator: 'is_any_of',
          operators: [
            { value: 'is_any_of', label: 'is any of' },
            { value: 'is_not_any_of', label: 'is not any of' },
          ],
          options: STATUS_ORDER.map((status) => ({
            value: status,
            label: `${STATUS_LABEL[status]} (${statusTotals[status]})`,
            icon: (
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-full', statusDotClass[status])}
              />
            ),
          })),
        },
      ];

      if (allTags.length > 0) {
        fields.push({
          key: 'tag',
          label: 'Tag',
          icon: <TagsIcon className="size-3.5" aria-hidden="true" />,
          type: 'multiselect',
          searchable: true,
          defaultOperator: 'is_any_of',
          operators: [
            { value: 'is_any_of', label: 'is any of' },
            { value: 'is_not_any_of', label: 'is not any of' },
            { value: 'includes_all', label: 'includes all' },
            { value: 'excludes_all', label: 'excludes all' },
          ],
          options: allTags.map(({ tag, count }) => ({
            value: tag,
            label: `#${tag} (${count})`,
          })),
        });
      }

      return fields;
    },
    [allTags, statusTotals],
  );
  const filtered = useMemo(
    () => adrs.filter((adr) => adrMatchesRules(adr, filters)),
    [adrs, filters],
  );
  const grouped = useMemo(() => groupByYear(filtered), [filtered]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('adr-layout');
      if (saved === 'spine' || saved === 'grouped') setLayout(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('adr-layout', layout);
    } catch {}
  }, [layout]);

  const handleFiltersChange = (next: Filter<string>[]) => {
    setFilters(
      next.filter(
        (filter) =>
          filter.values.length > 0 ||
          filter.operator === 'empty' ||
          filter.operator === 'not_empty',
      ),
    );
  };

  const rels = shown ? adrRelations(shown, lookup) : [];

  return (
    <section className="adr-timeline">
      <CollectionFilterBar
        filters={filters}
        fields={filterFields}
        onChange={handleFiltersChange}
        resultCount={filtered.length}
        totalCount={adrs.length}
        resultLabel="decisions"
        actions={
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[layout]}
            onValueChange={(value: string[]) => {
              const next = value[0] as Layout | undefined;
              if (next) setLayout(next);
            }}
          >
            <ToggleGroupItem
              value="spine"
              className="font-mono text-meta uppercase tracking-label-sm"
            >
              <GitCommitVerticalIcon aria-hidden="true" />
              Spine
            </ToggleGroupItem>
            <ToggleGroupItem
              value="grouped"
              className="font-mono text-meta uppercase tracking-label-sm"
            >
              <Rows3Icon aria-hidden="true" />
              Grouped
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="mx-auto max-w-4xl pt-9 pb-20">
          {filtered.length === 0 ? (
            <div
              className="px-5 py-20 text-center font-serif text-[1.2rem] text-muted-foreground"
              role="status"
            >
              <span className="mb-3 block font-mono text-meta uppercase tracking-label text-faint">
                no matches
              </span>
              Nothing matches these filters yet.
            </div>
          ) : layout === 'spine' ? (
            <Timeline value={filtered.length}>
              {filtered.map((adr, index) => {
                const line = primaryAdrRelation(adr, lookup);
                return (
                  <TimelineItem
                    key={adr.num}
                    step={index + 1}
                    className="not-last:pb-10"
                  >
                    <TimelineHeader>
                      <TimelineSeparator className="bg-border!" />
                      <TimelineIndicator
                        className={cn(
                          'size-3 border-0 shadow-[0_0_0_4px_var(--background)]',
                          statusDotClass[adr.status],
                        )}
                      />
                      <TimelineDate
                        dateTime={adr.date}
                        className="mb-2 font-mono text-meta-lg font-normal tabular-nums text-foreground"
                      >
                        {adr.dateLabel}
                      </TimelineDate>
                    </TimelineHeader>
                    <TimelineContent className="text-foreground">
                      <button
                        type="button"
                        onClick={() => setOpenNum(adr.num)}
                        className={cn(cardBase, 'px-5 py-[18px]')}
                        data-adr-card={adr.num}
                      >
                        <div className="mb-2.5 flex items-start gap-2.5">
                          <span className="font-mono text-meta tabular-nums text-primary">
                            ADR-{adr.num}
                          </span>
                          <StatusBadge status={adr.status} className="ml-auto" />
                        </div>
                        <TimelineTitle
                          render={<h2 />}
                          className="m-0 font-serif text-[1.32rem] font-medium leading-[1.18] tracking-[-0.008em]"
                        >
                          {adr.title}
                        </TimelineTitle>
                        {adr.summary && (
                          <p className="mt-2 font-serif text-[15px] leading-relaxed text-muted-foreground text-pretty max-[760px]:line-clamp-3">
                            {adr.summary}
                          </p>
                        )}
                        <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {adr.tags.map((tag) => (
                              <span
                                key={tag}
                                className="font-mono text-meta tracking-wide text-faint before:opacity-50 before:content-['#']"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {line && <LineageBadge rel={line} />}
                        </div>
                      </button>
                    </TimelineContent>
                  </TimelineItem>
                );
              })}
            </Timeline>
          ) : (
            grouped.map((group) => (
              <div key={group.year}>
                <div className={cn(groupedCell, 'my-1.5 items-center')}>
                  <div className="pr-1 text-right font-serif text-[1.7rem] font-medium tabular-nums text-foreground max-[760px]:col-span-2 max-[760px]:text-left max-[760px]:text-[1.3rem]">
                    {group.year}
                  </div>
                  <div className="relative flex justify-center py-3.5 max-[760px]:hidden">
                    <span className="relative z-10 size-[9px] rounded-full bg-muted-foreground" />
                  </div>
                  <div className="font-mono text-meta uppercase tracking-label-sm text-faint max-[760px]:col-span-2">
                    {group.items.length} decision
                    {group.items.length > 1 ? 's' : ''}
                  </div>
                </div>
                {group.items.map((adr) => (
                  <div key={adr.num} className={cn(groupedCell, 'items-center')}>
                    <div className="pr-1 text-right max-[760px]:hidden">
                      <div className="font-mono text-meta tabular-nums text-faint">
                        {adr.dateLabel}
                      </div>
                    </div>
                    <div className="relative flex justify-center py-2.5">
                      <span
                        className={cn(
                          'relative z-10 size-[9px] rounded-full',
                          statusDotClass[adr.status],
                        )}
                      />
                    </div>
                    <div className="py-1.5 pl-2 max-[760px]:col-start-2 max-[760px]:row-start-1">
                      <button
                        type="button"
                        onClick={() => setOpenNum(adr.num)}
                        className={cn(cardBase, 'px-[15px] py-[11px]')}
                        data-adr-card={adr.num}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-meta tabular-nums text-primary">
                            ADR-{adr.num}
                          </span>
                          <h2 className="min-w-0 flex-1 truncate font-serif text-[1.06rem] font-medium leading-tight tracking-tight">
                            {adr.title}
                          </h2>
                          <StatusBadge status={adr.status} />
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
      </div>

      <AdrDetailDialog
        open={openNum != null}
        shown={shown}
        relations={rels}
        onOpenChange={(open) => {
          if (!open) setOpenNum(null);
        }}
        onSelectAdr={setOpenNum}
      />
    </section>
  );
}
