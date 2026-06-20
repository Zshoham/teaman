import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GitCommitVerticalIcon,
  Rows3Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FilterPill } from "@/components/FilterPill";
import { StatusBadge } from "@/components/StatusBadge";
import { TopicsSidebar } from "@/components/home/TopicsSidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  adrMatches,
  byNum,
  groupByYear,
  statusColor,
  statusCounts,
  tagCounts,
  STATUS_LABEL,
  STATUS_ORDER,
  type AdrStatus,
} from "@/lib/adr-shared";

/** The serializable slice of an ADR the island renders (no Astro entry). */
export interface AdrView {
  num: string;
  title: string;
  date: string;
  dateLabel: string;
  status: AdrStatus;
  tags: string[];
  summary: string;
  supersedes?: string;
  supersededBy?: string;
  /** Pre-rendered markdown body HTML for the modal. */
  bodyHtml: string;
}

type Layout = "spine" | "grouped";

interface Relation {
  label: string;
  num: string;
  dir: "l" | "r";
  target: AdrView;
}

const cardBase =
  "group block w-full cursor-pointer rounded-[var(--radius)] border border-border bg-card text-left transition-all hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--primary)_45%,var(--border))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function LineageBadge({ rel }: { rel: Relation }) {
  const Arrow = rel.dir === "r" ? ArrowRightIcon : ArrowLeftIcon;
  return (
    <span className="ml-auto inline-flex flex-none items-center gap-2 rounded-full border border-border bg-muted py-[5px] pr-3 pl-[9px] font-mono text-meta-sm leading-none">
      <Arrow
        className="size-[13px] flex-none"
        style={{ color: statusColor(rel.target.status) }}
      />
      <span className="uppercase tracking-[0.05em] text-faint">
        {rel.label}
      </span>
      <span className="font-medium tabular-nums text-foreground">
        ADR-{rel.num}
      </span>
    </span>
  );
}

const cellL =
  "grid grid-cols-[124px_44px_1fr] max-[760px]:grid-cols-[64px_36px_1fr]";

export function AdrTimeline({ adrs }: { adrs: AdrView[] }) {
  const [statuses, setStatuses] = useState<Set<string>>(
    () => new Set(STATUS_ORDER),
  );
  const [tags, setTags] = useState<Set<string>>(() => new Set());
  const [layout, setLayout] = useState<Layout>("spine");
  const [openNum, setOpenNum] = useState<string | null>(null);

  const lookup = useMemo(() => byNum(adrs), [adrs]);
  const sCounts = useMemo(() => statusCounts(adrs), [adrs]);
  const allTags = useMemo(() => tagCounts(adrs), [adrs]);
  const filtered = useMemo(
    () => adrs.filter((a) => adrMatches(a, { statuses, tags })),
    [adrs, statuses, tags],
  );
  const grouped = useMemo(() => groupByYear(filtered), [filtered]);
  const isFiltered = tags.size > 0 || statuses.size < STATUS_ORDER.length;

  // Restore the persisted layout, then keep it in sync.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("adr-layout");
      if (saved === "spine" || saved === "grouped") setLayout(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("adr-layout", layout);
    } catch {}
  }, [layout]);

  // Deep-link: open the ADR named in the hash (on mount and on later hash
  // changes — e.g. a Pagefind result clicked while already on this page), and
  // reflect the open one back into the hash.
  useEffect(() => {
    const openFromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (h && lookup.has(h)) setOpenNum(h);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [lookup]);
  useEffect(() => {
    if (openNum) {
      if (location.hash.slice(1) !== openNum)
        history.replaceState(null, "", `#${openNum}`);
    } else if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, [openNum]);

  const toggleStatus = (s: string) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  const toggleTag = (t: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  const clearFilters = () => {
    setStatuses(new Set(STATUS_ORDER));
    setTags(new Set());
  };

  function lineageOf(a: AdrView): Relation | null {
    if (a.supersededBy && lookup.has(a.supersededBy))
      return {
        label: "Superseded by",
        num: a.supersededBy,
        dir: "r",
        target: lookup.get(a.supersededBy)!,
      };
    if (a.supersedes && lookup.has(a.supersedes))
      return {
        label: "Supersedes",
        num: a.supersedes,
        dir: "l",
        target: lookup.get(a.supersedes)!,
      };
    return null;
  }
  function relationsOf(a: AdrView): Relation[] {
    const out: Relation[] = [];
    if (a.supersedes && lookup.has(a.supersedes))
      out.push({
        label: "supersedes",
        num: a.supersedes,
        dir: "l",
        target: lookup.get(a.supersedes)!,
      });
    if (a.supersededBy && lookup.has(a.supersededBy))
      out.push({
        label: "superseded by",
        num: a.supersededBy,
        dir: "r",
        target: lookup.get(a.supersededBy)!,
      });
    return out;
  }

  // Keep the last opened ADR mounted through the dialog's exit transition.
  const lastShown = useRef<AdrView | undefined>(undefined);
  const current = openNum ? lookup.get(openNum) : undefined;
  if (current) lastShown.current = current;
  const shown = current ?? lastShown.current;
  const rels = shown ? relationsOf(shown) : [];

  const resultLine = (
    <div className="font-mono text-meta tabular-nums leading-snug text-faint">
      <b className="font-medium text-foreground">{filtered.length}</b> of{" "}
      {adrs.length} decisions
      {isFiltered && (
        <button
          type="button"
          onClick={clearFilters}
          className="mt-1 block w-fit cursor-pointer border-b border-transparent bg-transparent p-0 font-[inherit] text-primary hover:border-primary"
        >
          clear filters
        </button>
      )}
    </div>
  );

  return (
    <section className="adr-timeline">
      {/* Toolbar */}
      <div className="sticky top-[var(--header-h)] z-20 flex flex-wrap items-center gap-3.5 border-b border-border bg-background py-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_ORDER.map((s) => (
            <FilterPill
              key={s}
              aria-pressed={statuses.has(s)}
              onClick={() => toggleStatus(s)}
              count={sCounts[s]}
              dotColor={statusColor(s)}
            >
              {STATUS_LABEL[s]}
            </FilterPill>
          ))}
        </div>
        <ToggleGroup
          className="ml-auto"
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
            className="font-mono text-meta uppercase tracking-[0.06em]"
          >
            <GitCommitVerticalIcon />
            Spine
          </ToggleGroupItem>
          <ToggleGroupItem
            value="grouped"
            className="font-mono text-meta uppercase tracking-[0.06em]"
          >
            <Rows3Icon />
            Grouped
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Timeline + rail */}
      <div className="grid items-start gap-10 pt-9 pb-20 md:grid-cols-[minmax(0,1fr)_196px] md:gap-14">
        <div className="relative">
          {layout === "spine" && filtered.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-[var(--spine-x)] z-0 w-px -translate-x-1/2"
              style={{
                background:
                  "linear-gradient(var(--background), var(--border) 26px, var(--border) calc(100% - 26px), var(--background))",
              }}
            />
          )}

          {filtered.length === 0 ? (
            <div className="px-5 py-20 text-center font-serif text-[1.2rem] text-muted-foreground">
              <span className="mb-3 block font-mono text-meta uppercase tracking-label text-faint">
                no matches
              </span>
              Nothing matches these filters yet.
            </div>
          ) : layout === "spine" ? (
            filtered.map((a) => {
              const line = lineageOf(a);
              return (
                <div key={a.num} className={cn(cellL, "items-start")}>
                  <div className="pt-1 pr-1 pb-10 text-right">
                    <div className="font-mono text-[0.9rem] tabular-nums text-foreground max-[760px]:text-meta">
                      {a.dateLabel}
                    </div>
                  </div>
                  <div className="relative flex justify-center pb-10">
                    <span
                      className="relative z-10 mt-[5px] size-3 rounded-full shadow-[0_0_0_4px_var(--background)]"
                      style={{ background: statusColor(a.status) }}
                    />
                  </div>
                  <div className="pb-10 pl-2">
                    <button
                      type="button"
                      onClick={() => setOpenNum(a.num)}
                      className={cn(
                        cardBase,
                        "px-5 py-[18px] shadow-xs hover:shadow-md",
                      )}
                    >
                      <div className="mb-2.5 flex items-start gap-2.5">
                        <span className="font-mono text-meta tabular-nums tracking-[0.02em] text-primary">
                          ADR-{a.num}
                        </span>
                        <StatusBadge status={a.status} className="ml-auto" />
                      </div>
                      <h3 className="m-0 font-serif text-[1.32rem] font-medium leading-[1.18] tracking-[-0.008em]">
                        {a.title}
                      </h3>
                      {a.summary && (
                        <p className="mt-2 text-[0.96rem] leading-normal text-muted-foreground text-pretty">
                          {a.summary}
                        </p>
                      )}
                      <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {a.tags.map((t) => (
                            <span
                              key={t}
                              className="font-mono text-meta-sm text-faint before:opacity-50 before:content-['#']"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        {line && <LineageBadge rel={line} />}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            grouped.map((group) => (
              <div key={group.year}>
                <div className={cn(cellL, "my-1.5 items-center")}>
                  <div className="pr-1 text-right font-serif text-[1.7rem] font-medium tabular-nums text-foreground max-[760px]:text-[1.3rem]">
                    {group.year}
                  </div>
                  <div className="relative flex justify-center py-3.5">
                    <span className="relative z-10 size-[9px] rounded-full bg-muted-foreground" />
                  </div>
                  <div className="font-mono text-meta uppercase tracking-[0.06em] text-faint">
                    {group.items.length} decision
                    {group.items.length > 1 ? "s" : ""}
                  </div>
                </div>
                {group.items.map((a) => (
                  <div key={a.num} className={cn(cellL, "items-center")}>
                    <div className="pr-1 text-right">
                      <div className="font-mono text-meta tabular-nums text-faint">
                        {a.dateLabel}
                      </div>
                    </div>
                    <div className="relative flex justify-center py-2.5">
                      <span
                        className="relative z-10 size-[9px] rounded-full"
                        style={{ background: statusColor(a.status) }}
                      />
                    </div>
                    <div className="py-1.5 pl-2">
                      <button
                        type="button"
                        onClick={() => setOpenNum(a.num)}
                        className={cn(cardBase, "px-[15px] py-[11px]")}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-meta tabular-nums text-primary">
                            ADR-{a.num}
                          </span>
                          <h3 className="min-w-0 flex-1 truncate font-serif text-[1.06rem] font-medium leading-tight tracking-tight">
                            {a.title}
                          </h3>
                          <StatusBadge status={a.status} />
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <TopicsSidebar
          topics={allTags}
          title="filter by tag"
          header={resultLine}
          activeTags={tags}
          onToggle={toggleTag}
        />
      </div>

      {/* Detail modal */}
      <Dialog
        open={openNum != null}
        onOpenChange={(o: boolean) => {
          if (!o) setOpenNum(null);
        }}
      >
        <DialogContent>
          {shown && (
            <>
              <div className="relative border-b border-border px-9 pt-[30px] pb-[22px] max-[760px]:px-[22px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-meta tabular-nums text-primary">
                    ADR-{shown.num}
                  </span>
                  <span className="font-mono text-meta tabular-nums text-faint">
                    {shown.dateLabel}
                  </span>
                  <StatusBadge status={shown.status} />
                </div>
                <DialogTitle className="mt-3.5 max-w-[92%] font-serif text-[1.85rem] font-medium leading-tight tracking-[-0.01em] text-pretty">
                  {shown.title}
                </DialogTitle>
                {shown.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-[7px]">
                    {shown.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-meta-sm text-faint before:opacity-50 before:content-['#']"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-9 pt-2 pb-[34px] max-[760px]:px-[22px]">
                <div
                  className="prose"
                  dangerouslySetInnerHTML={{ __html: shown.bodyHtml }}
                />
                {rels.length > 0 && (
                  <div className="mt-[22px] border-t border-border pt-[22px]">
                    <h2 className="mb-3 font-mono text-meta uppercase tracking-label text-primary">
                      Related
                    </h2>
                    <div className="flex flex-wrap gap-2.5">
                      {rels.map((r) => {
                        const Arrow =
                          r.dir === "r" ? ArrowRightIcon : ArrowLeftIcon;
                        return (
                          <button
                            key={r.num}
                            type="button"
                            onClick={() => setOpenNum(r.num)}
                            style={{
                              ["--dot" as string]: statusColor(r.target.status),
                            }}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted py-2 pr-[15px] pl-3 font-mono text-meta text-muted-foreground transition-all hover:border-[color-mix(in_oklab,var(--dot)_50%,var(--border))] hover:text-foreground"
                          >
                            <Arrow
                              className="size-3.5 flex-none"
                              style={{ color: statusColor(r.target.status) }}
                            />
                            <span className="uppercase tracking-[0.05em] text-faint">
                              {r.label}
                            </span>
                            <span className="font-medium tabular-nums text-foreground">
                              ADR-{r.num}
                            </span>
                            <span className="text-faint">·</span>{" "}
                            {r.target.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
