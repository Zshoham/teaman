import { useEffect, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  adrRelationLabel,
  statusColor,
  type AdrRelation,
} from "@/lib/adr-shared";
import { cn } from "@/lib/utils";
import type { AdrView } from "./types";

interface AdrDetailDialogProps {
  open: boolean;
  shown: AdrView | undefined;
  relations: AdrRelation<AdrView>[];
  onOpenChange: (open: boolean) => void;
  onSelectAdr: (num: string) => void;
}

export function AdrDetailDialog({
  open,
  shown,
  relations,
  onOpenChange,
  onSelectAdr,
}: AdrDetailDialogProps) {
  // Long decisions get a taller, wider reading surface. Every open starts
  // compact again, so a short ADR never inherits the previous one's size.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[min(90vh,760px)]",
          expanded &&
            "h-[calc(100dvh-5vh-2rem)] max-h-[calc(100dvh-5vh-2rem)] max-w-[min(1100px,calc(100vw-2.5rem))]",
        )}
      >
        {shown && (
          <ScrollArea
            className="min-h-0 flex-1"
            // The dialog is a column of prose, never a sideways surface: the
            // primitive's `min-width: fit-content` lets the body be laid out
            // wider than the viewport (older Chrome resolves it against an
            // indefinite width and lands on max-content; any engine does it
            // for a wide `pre` or table, whose min-content is its longest
            // line), and only a vertical scrollbar is rendered here, so the
            // overflowing right-hand edge is unreachable. Wrap instead —
            // wide code and tables carry their own `overflow-x`.
            wrapContent
          >
            <div className="relative shrink-0 border-b border-border px-9 pt-[30px] pb-[22px] max-[760px]:px-[22px]">
              {/* Keep the reading column at --measure when the dialog widens. */}
              <div className="mx-auto max-w-[var(--measure)]">
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
                {shown.summary && (
                  <p className="mt-3.5 font-serif text-[1.05rem] leading-relaxed text-muted-foreground text-pretty">
                    {shown.summary}
                  </p>
                )}
                {shown.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-[7px]">
                    {shown.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-meta tracking-wide text-faint before:opacity-50 before:content-['#']"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-9 pt-2 pb-[34px] max-[760px]:px-[22px]">
              <div className="mx-auto max-w-[var(--measure)]">
                <div
                  className="prose"
                  dangerouslySetInnerHTML={{ __html: shown.bodyHtml }}
                />
                {relations.length > 0 && (
                  <div className="mt-[22px] border-t border-border pt-[22px]">
                    <h2 className="mb-3 font-mono text-meta uppercase tracking-label text-faint">
                      Related
                    </h2>
                    <div className="flex flex-wrap gap-2.5">
                      {relations.map((relation) => {
                        const Arrow =
                          relation.dir === "r" ? ArrowRightIcon : ArrowLeftIcon;
                        return (
                          <button
                            key={relation.num}
                            type="button"
                            onClick={() => onSelectAdr(relation.num)}
                            style={{
                              ["--dot" as string]: statusColor(
                                relation.target.status,
                              ),
                            }}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted py-2 pr-[15px] pl-3 font-mono text-meta text-muted-foreground transition-all hover:border-[color-mix(in_oklab,var(--dot)_50%,var(--border))] hover:text-foreground"
                          >
                            <Arrow
                              className="size-3.5 flex-none"
                              style={{ color: statusColor(relation.target.status) }}
                            />
                            <span className="uppercase tracking-label-sm text-faint">
                              {adrRelationLabel(relation, "sentence")}
                            </span>
                            <span className="font-medium tabular-nums text-foreground">
                              ADR-{relation.num}
                            </span>
                            <span className="text-faint">·</span>{" "}
                            {relation.target.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Restore size" : "Enlarge dialog"}
          title={expanded ? "Restore size" : "Enlarge dialog"}
          className="absolute top-[22px] right-[66px] inline-flex size-[34px] cursor-pointer items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {expanded ? (
            <Minimize2Icon className="size-[15px]" aria-hidden="true" />
          ) : (
            <Maximize2Icon className="size-[15px]" aria-hidden="true" />
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}
