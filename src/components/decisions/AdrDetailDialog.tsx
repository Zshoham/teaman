import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  adrRelationLabel,
  statusColor,
  type AdrRelation,
} from "@/lib/adr-shared";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                      className="font-mono text-meta tracking-wide text-faint before:opacity-50 before:content-['#']"
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
